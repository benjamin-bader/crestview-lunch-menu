/**
 * Streaming menu scraper for Crest View Elementary School lunch menus.
 *
 * HTMLRewriter-based implementation for Cloudflare Workers compatibility.
 * Provides equivalent functionality to the cheerio-based scraper with better
 * performance and memory efficiency.
 */

import { startOfWeek, endOfWeek, format, isSameWeek } from "date-fns";
import { MealType, FoodCategory, MenuItem, MenuItemData, DailyMenu, WeeklyMenu, MonthlyMenu } from "./models";

export class StreamingScraper {
  private readonly ajaxBaseUrl: string;
  private readonly ajaxEndpoints: Record<MealType, string>;

  // Static color mapping to avoid recreating on every element
  private static readonly COLOR_MAPPINGS: Record<string, FoodCategory> = {
    "#220AFD": FoodCategory.MAIN_ENTREE,
    "#52B73E": FoodCategory.VEGETARIAN_ENTREE,
    "#000000": FoodCategory.ELEMENTARY_SECONDARY_SECOND_CHOICE,
    "#EFE013": FoodCategory.ELEMENTARY_SECONDARY_SIDE_DISH,
    "#BC0945": FoodCategory.MAIN_ENTREE,
    "#F90303": FoodCategory.AFTERSCHOOL_SNACK,
    "#651594": FoodCategory.PRESCHOOL_SNACK,
    "#247632": FoodCategory.SAC_SNACK,
  };

  constructor(ajaxBaseUrl: string = "https://cve.bvsd.org/fs/elements") {
    this.ajaxBaseUrl = ajaxBaseUrl;

    // AJAX endpoint element IDs for each meal type
    this.ajaxEndpoints = {
      [MealType.BREAKFAST]: "74972",
      [MealType.LUNCH]: "74979",
      [MealType.SNACK]: "74986",
    };
  }

  /**
   * Fetch menu data using AJAX endpoints with HTMLRewriter
   */
  async fetchMenuForDateAjax(targetDate: Date, mealType: MealType): Promise<DailyMenu[] | null> {
    try {
      const elementId = this.ajaxEndpoints[mealType];
      if (!elementId) {
        console.log(`Unsupported meal type: ${mealType}`);
        return null;
      }

      // Build AJAX URL
      const ajaxUrl = `${this.ajaxBaseUrl}/${elementId}`;
      const params = new URLSearchParams({
        cal_date: targetDate.toISOString().split("T")[0],
        is_draft: "false",
        is_load_more: "true",
        page_id: "6212",
        parent_id: elementId,
        _: "0",
      });

      const response = await fetch(`${ajaxUrl}?${params}`, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.5",
          "Accept-Encoding": "gzip, deflate",
          Referer: "https://cve.bvsd.org/school-life/lunch-menus",
          DNT: "1",
          Connection: "keep-alive",
          "Upgrade-Insecure-Requests": "1",
        },
      });

      if (!response.ok) {
        console.error(`HTTP ${response.status} for ${ajaxUrl}:`, await response.text());
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Parse using HTMLRewriter
      return this.parseCalendarFragment(response, mealType);
    } catch (error) {
      console.error(`Error fetching AJAX menu data:`, error);
      return null;
    }
  }

  /**
   * Fetch all meal types for a date using AJAX endpoints
   */
  async fetchAllMealsForDateAjax(targetDate: Date): Promise<MonthlyMenu | null> {
    const allDailyMenus: DailyMenu[] = [];

    // Fetch each meal type separately using AJAX
    for (const mealType of [MealType.BREAKFAST, MealType.LUNCH, MealType.SNACK]) {
      const dailyMenus = await this.fetchMenuForDateAjax(targetDate, mealType);
      if (dailyMenus) {
        allDailyMenus.push(...dailyMenus);
      }
    }

    if (allDailyMenus.length === 0) {
      return null;
    }

    // Create monthly menu structure (same as original)
    const monthlyMenu = new MonthlyMenu({
      month: targetDate.getMonth() + 1,
      year: targetDate.getFullYear(),
    });

    // Group daily menus into weekly menus
    const weeklyMenus = this.groupDailyMenusByWeek(allDailyMenus);
    weeklyMenus.forEach((weeklyMenu) => monthlyMenu.addWeeklyMenu(weeklyMenu));

    return monthlyMenu;
  }

  /**
   * Parse calendar HTML fragment using HTMLRewriter
   *
   * HTMLRewriter processes HTML elements in document order as they appear in the stream.
   * The handlers work together to build menu data by maintaining state across multiple
   * nested elements. Here's how the parsing flow works:
   *
   * HTML Structure & Handler Flow:
   * ```
   * <div class="fsCalendarDaybox fsStateHasEvents">           ← 1. Start new day box
   *   <div class="fsCalendarDate" data-day="7" data-month="2"> ← 2. Set date for day box
   *     <span class="fsCalendarDay">Friday,</span>
   *     <span class="fsCalendarMonth">March</span> 7
   *   </div>
   *   <div class="fsCalendarInfo">                            ← 3. Start new menu item
   *     <span class="fsElementEventColorIcon"                 ← 4. Set item category
   *           style="background:#BC0945">
   *     </span>
   *     <a class="fsCalendarEventTitle"                       ← 5. Set item name/description
   *        title="Moe's Bagel with Plain Cream Cheese...">
   *       Moe's Bagel...
   *     </a>
   *   </div>
   *   <div class="fsCalendarInfo">                            ← 6. Start another menu item
   *     <!-- More menu items... -->
   *   </div>
   * </div>
   * <div class="fsCalendarDaybox fsStateHasEvents">           ← 7. Complete previous day box,
   *   <!-- Next day's data -->                                    start new day box
   * </div>
   * ```
   *
   * Handler Execution Order:
   * 1. **fsCalendarDaybox**: Triggers when a day container starts
   *    - Completes and saves the previous day box if it exists
   *    - Only starts a new day box if `fsStateHasEvents` class is present
   *    - Skips weekend boxes (`fsCalendarWeekendDayBox`)
   *
   * 2. **fsCalendarDate**: Triggers when date information is found
   *    - Extracts day, month, year from data attributes
   *    - Sets the date on the current day box (if one exists)
   *    - Handles zero-based months (0=January, 1=February, etc.)
   *
   * 3. **fsCalendarInfo**: Triggers when a menu item container starts
   *    - Completes and saves the previous menu item if it exists
   *    - Starts a new menu item within the current day box
   *    - Multiple fsCalendarInfo elements can exist per day
   *
   * 4. **fsElementEventColorIcon**: Triggers when a color indicator is found
   *    - Extracts background color from style attribute
   *    - Maps color to food category using COLOR_MAPPINGS
   *    - Sets the category on the current menu item
   *
   * 5. **fsCalendarEventTitle**: Triggers when menu item text is found
   *    - Extracts menu item name from title attribute
   *    - Filters out administrative announcements (no school, breaks, etc.)
   *    - Parses text to separate main dish name from full description
   *    - Sets name and description on the current menu item
   *
   * State Management:
   * - Uses a state object to track current day box and menu item
   * - Handlers complete previous items before starting new ones
   * - Final cleanup ensures last day box and menu item are saved
   * - Converts accumulated day boxes to DailyMenu objects
   *
   * Key Challenges:
   * - HTMLRewriter is event-driven and asynchronous
   * - State must be carefully managed across multiple nested elements
   * - Need to know when to "complete" menu items vs. continue accumulating data
   * - Multiple menu items per day require proper completion logic
   * - Elements are processed in document order, but we need to build hierarchical data
   */
  private async parseCalendarFragment(response: Response, mealType: MealType): Promise<DailyMenu[]> {
    const dailyMenus: DailyMenu[] = [];
    const dayBoxes: Array<{ date: Date | null; menuItems: MenuItemData[] }> = [];

    // Create a state object to avoid closure capture issues
    const state = {
      currentDayBox: null as { date: Date | null; menuItems: MenuItemData[] } | null,
      currentMenuItem: null as MenuItemData | null,
    };

    // Helper function to parse menu item text
    const parseMenuItemText = (text: string): { name: string; description: string } => {
      const cleanText = text.replace(/&amp;/g, "&").replace(/&#39;/g, "'");
      const parts = cleanText.split(/\s+with\s+/);
      if (parts.length > 1) {
        const name = parts[0].trim();
        return { name, description: cleanText };
      } else {
        return { name: cleanText, description: cleanText };
      }
    };

    // Set up HTMLRewriter with simplified handlers
    const rewriter = new HTMLRewriter()
      .on("div.fsCalendarDaybox", {
        element(element: Element) {
          // Complete previous day box if we have one
          if (state.currentDayBox) {
            // Complete any pending menu item
            if (state.currentMenuItem && state.currentMenuItem.name) {
              state.currentDayBox.menuItems.push(state.currentMenuItem);
            }
            // Save the day box if it has valid data
            if (state.currentDayBox.date && state.currentDayBox.menuItems.length > 0) {
              dayBoxes.push(state.currentDayBox);
            }
          }

          // Skip weekend boxes (but not out-of-range dates)
          const classNames = element.getAttribute("class") || "";
          if (classNames.includes("fsCalendarWeekendDayBox")) {
            state.currentDayBox = null;
            state.currentMenuItem = null;
            return;
          }

          // Check if this daybox has events before starting
          const hasEvents = classNames.includes("fsStateHasEvents");
          if (hasEvents) {
            // Start a new day box
            state.currentDayBox = { date: null, menuItems: [] };
            state.currentMenuItem = null;
          } else {
            state.currentDayBox = null;
            state.currentMenuItem = null;
          }
        },
      })
      .on("div.fsCalendarDate", {
        element(element: Element) {
          const day = parseInt(element.getAttribute("data-day") || "0", 10);
          const month = parseInt(element.getAttribute("data-month") || "0", 10);
          const year = parseInt(element.getAttribute("data-year") || "0", 10);

          // Handle zero-based months (0=January, 1=February, etc.)
          const adjustedMonth = month >= 0 ? month + 1 : 0;

          // Validate date components and set on current day box
          if (day > 0 && adjustedMonth > 0 && year > 0 && state.currentDayBox) {
            try {
              const date = new Date(year, adjustedMonth - 1, day);
              state.currentDayBox.date = date;
            } catch {
              // Invalid date, skip
            }
          }
        },
      })
      .on("div.fsCalendarInfo", {
        element(element: Element) {
          // Complete previous menu item if we have one
          if (state.currentMenuItem && state.currentMenuItem.name && state.currentDayBox) {
            state.currentDayBox.menuItems.push(state.currentMenuItem);
          }

          // Start new menu item if we have a current day box
          if (state.currentDayBox) {
            state.currentMenuItem = {
              name: "",
              description: "",
              category: FoodCategory.OTHER,
              allergens: [],
              nutritionalInfo: {},
            };
          }
        },
      })
      .on("span.fsElementEventColorIcon", {
        element(element: Element) {
          if (state.currentMenuItem) {
            const style = element.getAttribute("style") || "";
            const colorMatch = style.match(/background:\s*([^;]+)/);

            if (colorMatch) {
              const color = colorMatch[1].trim().toUpperCase();
              const category = StreamingScraper.COLOR_MAPPINGS[color] || FoodCategory.OTHER;
              state.currentMenuItem.category = category;
            }
          }
        },
      })
      .on("a.fsCalendarEventTitle", {
        element(element: Element) {
          if (state.currentMenuItem) {
            let title = (element.getAttribute("title") || "").trim();
            if (title) {
              // Decode HTML entities properly
              title = title
                .replace(/&amp;/g, "&")
                .replace(/&#39;/g, "'")
                .replace(/&quot;/g, '"');

              // Filter out administrative announcements
              const lowerTitle = title.toLowerCase();
              const isAdminAnnouncement =
                lowerTitle.includes("no school") ||
                lowerTitle.includes("winter break") ||
                lowerTitle.includes("last day of school") ||
                lowerTitle.includes("memorial day") ||
                lowerTitle.includes("teacher") ||
                lowerTitle.includes("spring break") ||
                lowerTitle.includes("quarter ends");

              if (!isAdminAnnouncement) {
                const { name, description } = parseMenuItemText(title);
                state.currentMenuItem.name = name;
                state.currentMenuItem.description = description;
              }
            }
          }
        },
      });

    // Process the response
    const transformedResponse = rewriter.transform(response);
    await transformedResponse.text();

    // Complete final day box
    if (state.currentDayBox) {
      if (state.currentMenuItem && state.currentMenuItem.name) {
        state.currentDayBox.menuItems.push(state.currentMenuItem);
      }
      if (state.currentDayBox.date && state.currentDayBox.menuItems.length > 0) {
        dayBoxes.push(state.currentDayBox);
      }
    }

    // Convert day boxes to daily menus
    for (const dayBox of dayBoxes) {
      if (dayBox.date && dayBox.menuItems.length > 0) {
        const dailyMenu = new DailyMenu({
          date: format(dayBox.date, "yyyy-MM-dd"),
          mealType: mealType,
          menuItems: dayBox.menuItems.map((itemData) => new MenuItem(itemData)),
        });
        dailyMenus.push(dailyMenu);
      }
    }

    return dailyMenus;
  }

  /**
   * Group daily menus by week (same as original scraper)
   */
  private groupDailyMenusByWeek(dailyMenus: DailyMenu[]): WeeklyMenu[] {
    if (dailyMenus.length === 0) {
      return [];
    }

    const sortedMenus = dailyMenus.sort((a, b) => a.date.getTime() - b.date.getTime());
    const weeklyMenus: WeeklyMenu[] = [];
    let currentWeekMenus: DailyMenu[] = [];
    let currentWeekStartDate: Date | null = null;

    for (const dailyMenu of sortedMenus) {
      const weekStart = startOfWeek(dailyMenu.date, { weekStartsOn: 1 });

      if (!currentWeekStartDate || !isSameWeek(weekStart, currentWeekStartDate, { weekStartsOn: 1 })) {
        if (currentWeekMenus.length > 0 && currentWeekStartDate) {
          const weekEnd = endOfWeek(currentWeekStartDate, { weekStartsOn: 1 });

          const weeklyMenu = new WeeklyMenu({
            startDate: format(currentWeekStartDate, "yyyy-MM-dd"),
            endDate: format(weekEnd, "yyyy-MM-dd"),
            dailyMenus: currentWeekMenus,
          });
          weeklyMenus.push(weeklyMenu);
        }

        currentWeekStartDate = weekStart;
        currentWeekMenus = [dailyMenu];
      } else {
        currentWeekMenus.push(dailyMenu);
      }
    }

    if (currentWeekMenus.length > 0 && currentWeekStartDate) {
      const weekEnd = endOfWeek(currentWeekStartDate, { weekStartsOn: 1 });

      const weeklyMenu = new WeeklyMenu({
        startDate: format(currentWeekStartDate, "yyyy-MM-dd"),
        endDate: format(weekEnd, "yyyy-MM-dd"),
        dailyMenus: currentWeekMenus,
      });
      weeklyMenus.push(weeklyMenu);
    }

    return weeklyMenus;
  }

  /**
   * Fetch weekly meals for scheduled operations
   *
   * Determines the target week based on current day:
   * - Weekdays (Mon-Fri): Fetch current week's meals
   * - Weekends (Sat-Sun): Fetch next week's meals
   *
   * @param currentDate Optional current date (defaults to now)
   * @returns WeeklyMenu for the target week, or null if no data found
   */
  async fetchWeeklyMenuForScheduledRun(currentDate?: Date): Promise<WeeklyMenu | null> {
    const now = currentDate || new Date();
    const currentDay = now.getDay(); // 0 = Sunday, 6 = Saturday

    // Determine target date for menu fetching
    // If today is Saturday (6) or Sunday (0), fetch next week's meals
    // Otherwise, fetch current week's meals
    let targetDate: Date;
    if (currentDay === 0 || currentDay === 6) {
      // Weekend - fetch next week
      // Add 7 days to get to next week
      targetDate = new Date(now);
      targetDate.setDate(now.getDate() + 7);
    } else {
      // Weekday - fetch current week
      targetDate = now;
    }

    try {
      const monthlyMenu = await this.fetchAllMealsForDateAjax(targetDate);

      if (!monthlyMenu) {
        console.log("No menu data found for target date:", targetDate);
        return null;
      }

      // Extract one week's meals
      // Find the week that contains our target date
      const weeklyMenus = monthlyMenu.weeklyMenus;
      let targetWeekMenu: WeeklyMenu | null = null;

      for (const weeklyMenu of weeklyMenus) {
        // Use date-only comparison to avoid timezone issues
        const weekStart = new Date(weeklyMenu.startDate);
        const weekEnd = new Date(weeklyMenu.endDate);

        // Compare dates only (ignore time components)
        const targetDateOnly = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
        const weekStartOnly = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate());
        const weekEndOnly = new Date(weekEnd.getFullYear(), weekEnd.getMonth(), weekEnd.getDate());

        if (targetDateOnly >= weekStartOnly && targetDateOnly <= weekEndOnly) {
          targetWeekMenu = weeklyMenu;
          break;
        }
      }

      if (targetWeekMenu) {
        // We have one week's worth of meals
        const weeklyMeals = targetWeekMenu.dailyMenus;
        console.log(
          `Found ${weeklyMeals.length} daily menus for week ${targetWeekMenu.startDate} to ${targetWeekMenu.endDate}`
        );

        return targetWeekMenu;
      } else {
        console.log("No weekly menu found for target date:", targetDate);
        return null;
      }
    } catch (error) {
      console.error("Error in fetchWeeklyMenuForScheduledRun:", error);
      return null;
    }
  }
}
