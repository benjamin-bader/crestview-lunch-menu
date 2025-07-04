/**
 * Streaming menu scraper for Crest View Elementary School lunch menus.
 *
 * HTMLRewriter-based implementation for Cloudflare Workers compatibility.
 * Provides equivalent functionality to the cheerio-based scraper with better
 * performance and memory efficiency.
 */

import { startOfWeek, endOfWeek, format, isSameWeek } from "date-fns";
import { MealType, FoodCategory, MenuItem, MenuItemData, DailyMenu, WeeklyMenu, MonthlyMenu } from "./models";

// Raw data interfaces for state management
interface DayBoxData {
  date?: string; // ISO date string
  mealType: MealType;
  menuItems: MenuItemData[];
}

/**
 * State management for streaming HTML parsing
 */
class ScraperState {
  private currentDayBox: DayBoxData | null = null;
  private currentMenuItem: MenuItemData | null = null;
  private completedDays: DailyMenu[] = [];

  constructor(private mealType: MealType) {}

  // Day box management
  startDayBox(): void {
    // Complete the previous day box if we have one
    this.completePreviousDayBox();

    // Start a new day box
    this.currentDayBox = {
      mealType: this.mealType,
      menuItems: [],
    };
  }

  private completePreviousDayBox(): void {
    if (this.currentDayBox) {
      // Complete the day box if we have a valid date AND menu items
      if (this.currentDayBox.date && this.currentDayBox.menuItems.length > 0) {
        const dailyMenu = new DailyMenu({
          date: this.currentDayBox.date,
          mealType: this.currentDayBox.mealType,
          menuItems: this.currentDayBox.menuItems.map((itemData) => new MenuItem(itemData)),
        });
        this.completedDays.push(dailyMenu);
      }
    }
  }

  endDayBox(): void {
    this.completePreviousDayBox();
    this.currentDayBox = null;
  }

  // Date information
  setDateInfo(date: Date): void {
    if (this.currentDayBox) {
      this.currentDayBox.date = format(date, "yyyy-MM-dd");
    }
  }

  // Menu item management
  startMenuItem(): void {
    // Complete previous menu item if we have one
    this.completePreviousMenuItem();

    // Start new menu item
    this.currentMenuItem = {
      name: "",
      description: "",
      category: FoodCategory.OTHER,
      allergens: [],
      nutritionalInfo: {},
    };
  }

  private completePreviousMenuItem(): void {
    if (this.currentMenuItem && this.currentDayBox && this.currentMenuItem.name) {
      this.currentDayBox.menuItems.push({
        name: this.currentMenuItem.name,
        description: this.currentMenuItem.description || this.currentMenuItem.name,
        category: this.currentMenuItem.category,
        allergens: this.currentMenuItem.allergens,
        nutritionalInfo: this.currentMenuItem.nutritionalInfo,
      });
    }
  }

  endMenuItem(): void {
    this.completePreviousMenuItem();
    this.currentMenuItem = null;
  }

  // Menu item properties
  setMenuItemCategory(category: FoodCategory): void {
    if (this.currentMenuItem) {
      this.currentMenuItem.category = category;
    }
  }

  setMenuItemTitle(title: string): void {
    if (this.currentMenuItem) {
      // Filter out administrative announcements and non-food items
      const lowerTitle = title.toLowerCase();
      const isAdminAnnouncement =
        lowerTitle.includes("no school") ||
        lowerTitle.includes("winter break") ||
        lowerTitle.includes("last day of school") ||
        lowerTitle.includes("memorial day") ||
        lowerTitle.includes("teacher") ||
        lowerTitle.includes("spring break");

      if (isAdminAnnouncement) {
        // Skip administrative announcements - reset current menu item
        this.currentMenuItem = null;
        return;
      }

      const { name, description } = this.parseMenuItemText(title);
      this.currentMenuItem.name = name;
      this.currentMenuItem.description = description;
    }
  }

  // Get completed results
  getCompletedDays(): DailyMenu[] {
    return this.completedDays;
  }

  // Force completion of current state (for HTMLRewriter cleanup)
  endCurrentMenuItem(): void {
    this.endMenuItem();
  }

  endCurrentDayBox(): void {
    this.endDayBox();
  }

  // Helper method (fixed to not truncate on '&' characters)
  private parseMenuItemText(text: string): {
    name: string;
    description: string;
  } {
    // Clean up HTML entities
    const cleanText = text.replace(/&amp;/g, "&").replace(/&#39;/g, "'");

    // Only split on "with" to separate main dish from sides
    // Don't split on "&" as it's often part of the dish name (e.g., "Chicken & Waffles")
    const parts = cleanText.split(/\s+with\s+/);

    if (parts.length > 1) {
      const name = parts[0].trim();
      // Use the full text as description to preserve all information
      return { name, description: cleanText };
    } else {
      // For items without "with", use the full text as both name and description
      return { name: cleanText, description: cleanText };
    }
  }
}

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
   */
  private async parseCalendarFragment(response: Response, mealType: MealType): Promise<DailyMenu[]> {
    const state = new ScraperState(mealType);

    // Set up HTMLRewriter with all handlers
    const rewriter = new HTMLRewriter()
      .on("div.fsCalendarDaybox", {
        element(element: Element) {
          // Skip weekend boxes (but not out-of-range dates)
          const classNames = element.getAttribute("class") || "";
          if (classNames.includes("fsCalendarWeekendDayBox")) {
            return;
          }

          // Start a new day box (don't close previous one yet - let content finish processing)
          state.startDayBox();
        },
      })
      .on("div.fsCalendarDate", {
        element(element: Element) {
          const day = parseInt(element.getAttribute("data-day") || "0", 10);
          const month = parseInt(element.getAttribute("data-month") || "0", 10);
          const year = parseInt(element.getAttribute("data-year") || "0", 10);

          // Handle zero-based months (0=January, 1=February, etc.)
          const adjustedMonth = month >= 0 ? month + 1 : 0;

          // Validate date components
          if (day > 0 && adjustedMonth > 0 && year > 0) {
            try {
              const date = new Date(year, adjustedMonth - 1, day);
              state.setDateInfo(date);
            } catch {
              // Invalid date, skip
            }
          }
        },
      })
      .on("div.fsCalendarInfo", {
        element(element: Element) {
          state.startMenuItem();
        },
      })
      .on("span.fsElementEventColorIcon", {
        element(element: Element) {
          const style = element.getAttribute("style") || "";
          const colorMatch = style.match(/background:\s*([^;]+)/);

          if (colorMatch) {
            const color = colorMatch[1].trim().toUpperCase();
            const category = StreamingScraper.COLOR_MAPPINGS[color] || FoodCategory.OTHER;
            state.setMenuItemCategory(category);
          }
        },
      })
      .on("a.fsCalendarEventTitle", {
        element(element: Element) {
          let title = (element.getAttribute("title") || "").trim();
          if (title) {
            // Decode HTML entities properly
            title = title
              .replace(/&amp;/g, "&")
              .replace(/&#39;/g, "'")
              .replace(/&quot;/g, '"');
            state.setMenuItemTitle(title);
          }
        },
      });

    // Process the response
    const transformedResponse = rewriter.transform(response);

    // We need to consume the response to trigger the handlers
    await transformedResponse.text();

    // Complete any remaining items
    state.endMenuItem();
    state.endDayBox();

    // Return the parsed results
    return state.getCompletedDays();
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
