/**
 * Data models for Crest View Elementary School lunch menu scraper.
 *
 * This module defines the data structures for representing school meal menus,
 * including different meal types, food categories, and daily menu items.
 */

import { parseISO, format } from "date-fns";

// Enums - TypeScript enums are perfect equivalents to Python Enum
export enum MealType {
  BREAKFAST = "breakfast",
  LUNCH = "lunch",
  SNACK = "snack",
}

export enum Weekday {
  SUNDAY = 0,
  MONDAY = 1,
  TUESDAY = 2,
  WEDNESDAY = 3,
  THURSDAY = 4,
  FRIDAY = 5,
  SATURDAY = 6,
}

export enum FoodCategory {
  MAIN_ENTREE = "Main Entree",
  VEGETARIAN_ENTREE = "Vegetarian Entree",
  ELEMENTARY_SECONDARY_SECOND_CHOICE = "Elementary/Secondary Second Choice Entree",
  ELEMENTARY_SECONDARY_SIDE_DISH = "Elementary/Secondary Side Dish",
  AFTERSCHOOL_SNACK = "Afterschool Snack",
  PRESCHOOL_SNACK = "Preschool",
  SAC_SNACK = "SAC",
  OTHER = "Other",
}

// Interfaces for data structures (equivalent to dataclass fields)
export interface MenuItemData {
  name: string;
  description?: string;
  category?: FoodCategory;
  isVegetarian?: boolean;
  isVegan?: boolean;
  allergens?: string[];
  nutritionalInfo?: Record<string, unknown>;
}

// Classes with methods (equivalent to dataclasses with methods)
export class MenuItem {
  public readonly name: string;
  public readonly description: string | null;
  public readonly category: FoodCategory;
  public readonly isVegetarian: boolean;
  public readonly isVegan: boolean;
  public readonly allergens: string[];
  public readonly nutritionalInfo: Record<string, unknown>;

  constructor(data: MenuItemData) {
    this.name = data.name;
    this.description = data.description ?? null;
    this.category = data.category ?? FoodCategory.OTHER;
    this.allergens = data.allergens ?? [];
    this.nutritionalInfo = data.nutritionalInfo ?? {};

    // Post-initialization processing (equivalent to __post_init__)
    const nameLower = this.name.toLowerCase();

    // Check for vegan indicators
    const veganTerms = ["vegan", "plant forward", "plant-based"];
    const isVegan = data.isVegan ?? veganTerms.some((term) => nameLower.includes(term));

    // Check for vegetarian indicators
    const vegetarianTerms = ["vegetarian", "veggie", "tofu", "bean", "lentil"];
    const isVegetarian = data.isVegetarian ?? (isVegan || vegetarianTerms.some((term) => nameLower.includes(term)));

    this.isVegan = isVegan;
    this.isVegetarian = isVegetarian;
  }

  // JSON serialization helper
  toJSON() {
    return {
      name: this.name,
      description: this.description,
      category: this.category,
      isVegetarian: this.isVegetarian,
      isVegan: this.isVegan,
      allergens: this.allergens,
      nutritionalInfo: this.nutritionalInfo,
    };
  }

  // JSON deserialization helper
  static fromJSON(data: any): MenuItem {
    return new MenuItem(data);
  }
}

export interface DailyMenuData {
  date: string; // ISO date string
  mealType: MealType;
  menuItems?: MenuItem[];
  specialNotes?: string[];
  isSchoolDay?: boolean;
}

export class DailyMenu {
  public readonly date: Date;
  public readonly mealType: MealType;
  public readonly menuItems: MenuItem[];
  public readonly specialNotes: string[];
  public readonly isSchoolDay: boolean;

  constructor(data: DailyMenuData) {
    // Parse date safely with date-fns - no timezone conversion issues
    this.date = parseISO(data.date + "T12:00:00"); // Force noon to avoid timezone edge cases

    this.mealType = data.mealType;
    this.menuItems = data.menuItems ?? [];
    this.specialNotes = data.specialNotes ?? [];
    this.isSchoolDay = data.isSchoolDay ?? true;
  }

  addMenuItem(item: MenuItem): void {
    this.menuItems.push(item);
  }

  getItemsByCategory(category: FoodCategory): MenuItem[] {
    return this.menuItems.filter((item) => item.category === category);
  }

  getVegetarianItems(): MenuItem[] {
    return this.menuItems.filter((item) => item.isVegetarian);
  }

  getVeganItems(): MenuItem[] {
    return this.menuItems.filter((item) => item.isVegan);
  }

  toJSON() {
    return {
      date: format(this.date, "yyyy-MM-dd"), // YYYY-MM-DD format with date-fns
      mealType: this.mealType,
      menuItems: this.menuItems.map((item) => item.toJSON()),
      specialNotes: this.specialNotes,
      isSchoolDay: this.isSchoolDay,
    };
  }

  // JSON deserialization helper
  static fromJSON(data: any): DailyMenu {
    return new DailyMenu({
      date: data.date,
      mealType: data.mealType,
      menuItems: data.menuItems ? data.menuItems.map((item: any) => MenuItem.fromJSON(item)) : [],
      specialNotes: data.specialNotes,
      isSchoolDay: data.isSchoolDay,
    });
  }
}

export interface DailyMeals {
  breakfast: DailyMenu | null;
  lunch: DailyMenu | null;
  snack: DailyMenu | null;
}

export interface WeeklyMenuData {
  startDate: string; // ISO date string
  endDate: string; // ISO date string
  dailyMenus?: DailyMenu[];
}

export class WeeklyMenu {
  public readonly startDate: Date;
  public readonly endDate: Date;
  public readonly dailyMenus: DailyMenu[];

  constructor(data: WeeklyMenuData) {
    // Parse dates safely with date-fns - no timezone conversion issues
    this.startDate = parseISO(data.startDate + "T12:00:00");
    this.endDate = parseISO(data.endDate + "T12:00:00");

    this.dailyMenus = data.dailyMenus ?? [];
  }

  addDailyMenu(dailyMenu: DailyMenu): void {
    this.dailyMenus.push(dailyMenu);
  }

  getMenusByType(mealType: MealType): DailyMenu[] {
    return this.dailyMenus.filter((menu) => menu.mealType === mealType);
  }

  getMenuByDate(targetDate: Date): DailyMenu | null {
    const targetDateStr = format(targetDate, "yyyy-MM-dd");
    return this.dailyMenus.find((menu) => format(menu.date, "yyyy-MM-dd") === targetDateStr) ?? null;
  }

  /**
   * Get all menus for a specific date (all meal types)
   */
  getMenusByDate(targetDate: Date): DailyMenu[] {
    const targetDateStr = format(targetDate, "yyyy-MM-dd");
    return this.dailyMenus.filter((menu) => format(menu.date, "yyyy-MM-dd") === targetDateStr);
  }

  /**
   * Get a specific meal type for a specific date
   */
  getMenuByDateAndType(targetDate: Date, mealType: MealType): DailyMenu | null {
    const targetDateStr = format(targetDate, "yyyy-MM-dd");
    return (
      this.dailyMenus.find((menu) => format(menu.date, "yyyy-MM-dd") === targetDateStr && menu.mealType === mealType) ??
      null
    );
  }

  /**
   * Get all meal types for a specific date organized by meal type
   * Returns an object with breakfast, lunch, and snack properties
   */
  getMealsByDate(targetDate: Date): DailyMeals {
    const targetDateStr = format(targetDate, "yyyy-MM-dd");
    const menus = this.dailyMenus.filter((menu) => format(menu.date, "yyyy-MM-dd") === targetDateStr);

    return {
      breakfast: menus.find((menu) => menu.mealType === MealType.BREAKFAST) ?? null,
      lunch: menus.find((menu) => menu.mealType === MealType.LUNCH) ?? null,
      snack: menus.find((menu) => menu.mealType === MealType.SNACK) ?? null,
    };
  }

  /**
   * Get all meal types for a specific weekday organized by meal type
   * Returns an object with breakfast, lunch, and snack properties
   */
  getMealsByWeekday(weekday: Weekday): {
    breakfast: DailyMenu | null;
    lunch: DailyMenu | null;
    snack: DailyMenu | null;
  } {
    const menus = this.dailyMenus.filter((menu) => menu.date.getDay() === weekday);

    return {
      breakfast: menus.find((menu) => menu.mealType === MealType.BREAKFAST) ?? null,
      lunch: menus.find((menu) => menu.mealType === MealType.LUNCH) ?? null,
      snack: menus.find((menu) => menu.mealType === MealType.SNACK) ?? null,
    };
  }

  /**
   * Get all menus for a specific weekday (all meal types)
   */
  getMenusByWeekday(weekday: Weekday): DailyMenu[] {
    return this.dailyMenus.filter((menu) => menu.date.getDay() === weekday);
  }

  /**
   * Get a specific meal type for a specific weekday
   */
  getMenuByWeekdayAndType(weekday: Weekday, mealType: MealType): DailyMenu | null {
    return this.dailyMenus.find((menu) => menu.date.getDay() === weekday && menu.mealType === mealType) ?? null;
  }

  toJSON() {
    return {
      startDate: format(this.startDate, "yyyy-MM-dd"),
      endDate: format(this.endDate, "yyyy-MM-dd"),
      dailyMenus: this.dailyMenus.map((menu) => menu.toJSON()),
    };
  }

  // JSON deserialization helper
  static fromJSON(data: any): WeeklyMenu {
    return new WeeklyMenu({
      startDate: data.startDate,
      endDate: data.endDate,
      dailyMenus: data.dailyMenus ? data.dailyMenus.map((menu: any) => DailyMenu.fromJSON(menu)) : [],
    });
  }
}

export interface MonthlyMenuData {
  year: number;
  month: number;
  weeklyMenus?: WeeklyMenu[];
}

export class MonthlyMenu {
  public readonly year: number;
  public readonly month: number;
  public readonly weeklyMenus: WeeklyMenu[];

  constructor(data: MonthlyMenuData) {
    this.year = data.year;
    this.month = data.month;
    this.weeklyMenus = data.weeklyMenus ?? [];
  }

  addWeeklyMenu(weeklyMenu: WeeklyMenu): void {
    this.weeklyMenus.push(weeklyMenu);
  }

  getAllDailyMenus(): DailyMenu[] {
    return this.weeklyMenus.flatMap((weeklyMenu) => weeklyMenu.dailyMenus);
  }

  getMenusByType(mealType: MealType): DailyMenu[] {
    return this.getAllDailyMenus().filter((menu) => menu.mealType === mealType);
  }

  /**
   * Get the WeeklyMenu for a given date
   * - For weekdays: returns the WeeklyMenu containing the date
   * - For weekends: returns the following WeeklyMenu (next week)
   */
  getWeeklyMenuForDate(targetDate: Date): WeeklyMenu | null {
    // Check if it's a weekend (Saturday = 6, Sunday = 0)
    const dayOfWeek = targetDate.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    if (isWeekend) {
      // For weekends, find the following WeeklyMenu
      // Calculate the next Monday after this weekend
      const nextMonday = new Date(targetDate);
      const daysUntilMonday = dayOfWeek === 0 ? 1 : 2; // Sunday = 1 day, Saturday = 2 days
      nextMonday.setDate(targetDate.getDate() + daysUntilMonday);

      // Find the WeeklyMenu that starts on or after this Monday
      const nextMondayStr = format(nextMonday, "yyyy-MM-dd");
      return this.weeklyMenus.find((menu) => format(menu.startDate, "yyyy-MM-dd") >= nextMondayStr) ?? null;
    } else {
      // For weekdays, find the WeeklyMenu containing this date
      const targetDateStr = format(targetDate, "yyyy-MM-dd");
      return (
        this.weeklyMenus.find(
          (menu) =>
            format(menu.startDate, "yyyy-MM-dd") <= targetDateStr && format(menu.endDate, "yyyy-MM-dd") >= targetDateStr
        ) ?? null
      );
    }
  }

  toJSON() {
    return {
      year: this.year,
      month: this.month,
      weeklyMenus: this.weeklyMenus.map((menu) => menu.toJSON()),
    };
  }

  // JSON deserialization helper
  static fromJSON(data: any): MonthlyMenu {
    return new MonthlyMenu({
      year: data.year,
      month: data.month,
      weeklyMenus: data.weeklyMenus ? data.weeklyMenus.map((menu: any) => WeeklyMenu.fromJSON(menu)) : [],
    });
  }
}

export interface TrmnlUserData {
  uuid: string;
  pluginSettingId: string;
}

export class TrmnlUser {
  public readonly uuid: string;
  public readonly pluginSettingId: string;

  constructor(data: TrmnlUserData) {
    this.uuid = data.uuid;
    this.pluginSettingId = data.pluginSettingId;
  }

  static keyOf(uuid: string): string {
    return `trmnl-user/${uuid}`;
  }
}

// Common menu items (equivalent to COMMON_MENU_ITEMS)
export const COMMON_MENU_ITEMS = {
  spaghettiMeatballs: new MenuItem({
    name: "Spaghetti & Meatballs with Mozzarella Cheese & Garlic Breadstick",
    category: FoodCategory.MAIN_ENTREE,
    isVegetarian: false,
  }),
  cheesePizza: new MenuItem({
    name: "Cheese Pizza",
    category: FoodCategory.MAIN_ENTREE,
    isVegetarian: true,
  }),
  hamburger: new MenuItem({
    name: "Hamburger or Cheeseburger with Oven Baked Fries",
    category: FoodCategory.MAIN_ENTREE,
    isVegetarian: false,
  }),
  toastedCheese: new MenuItem({
    name: "Toasted Cheese Sandwich with Tomato Bisque",
    category: FoodCategory.ELEMENTARY_SECONDARY_SECOND_CHOICE,
    isVegetarian: true,
  }),
  plantForwardBolognese: new MenuItem({
    name: "Plant Forward Bolognese with Garlic Breadstick",
    category: FoodCategory.VEGETARIAN_ENTREE,
    isVegetarian: true,
  }),
  veganTamales: new MenuItem({
    name: "Vegan Corn & Chile Tamales with Refried Beans & Rice",
    category: FoodCategory.VEGETARIAN_ENTREE,
    isVegan: true,
    isVegetarian: true,
  }),
} as const;

// Helper function (equivalent to create_sample_daily_menu)
export function createSampleDailyMenu(): DailyMenu {
  const dailyMenu = new DailyMenu({
    date: "2025-03-31", // Direct date string, no conversion needed
    mealType: MealType.LUNCH,
    isSchoolDay: true,
  });

  dailyMenu.addMenuItem(COMMON_MENU_ITEMS.spaghettiMeatballs);
  dailyMenu.addMenuItem(COMMON_MENU_ITEMS.toastedCheese);

  return dailyMenu;
}

// Helper function to convert weekday names to Weekday enum
export function getWeekdayFromName(weekdayName: string): Weekday | null {
  const name = weekdayName.toLowerCase();
  switch (name) {
    case "sunday":
    case "sun":
      return Weekday.SUNDAY;
    case "monday":
    case "mon":
      return Weekday.MONDAY;
    case "tuesday":
    case "tue":
    case "tues":
      return Weekday.TUESDAY;
    case "wednesday":
    case "wed":
      return Weekday.WEDNESDAY;
    case "thursday":
    case "thu":
    case "thurs":
      return Weekday.THURSDAY;
    case "friday":
    case "fri":
      return Weekday.FRIDAY;
    case "saturday":
    case "sat":
      return Weekday.SATURDAY;
    default:
      return null;
  }
}

// Helper function to convert Weekday enum to readable name
export function getWeekdayName(weekday: Weekday): string {
  switch (weekday) {
    case Weekday.SUNDAY:
      return "Sunday";
    case Weekday.MONDAY:
      return "Monday";
    case Weekday.TUESDAY:
      return "Tuesday";
    case Weekday.WEDNESDAY:
      return "Wednesday";
    case Weekday.THURSDAY:
      return "Thursday";
    case Weekday.FRIDAY:
      return "Friday";
    case Weekday.SATURDAY:
      return "Saturday";
    default:
      return "Unknown";
  }
}

// Type guards for runtime type checking
export function isMenuItem(obj: unknown): obj is MenuItem {
  return obj instanceof MenuItem;
}

export function isDailyMenu(obj: unknown): obj is DailyMenu {
  return obj instanceof DailyMenu;
}

export function isWeeklyMenu(obj: unknown): obj is WeeklyMenu {
  return obj instanceof WeeklyMenu;
}

export function isMonthlyMenu(obj: unknown): obj is MonthlyMenu {
  return obj instanceof MonthlyMenu;
}
