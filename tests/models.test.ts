import { MonthlyMenu, WeeklyMenu, DailyMenu, MenuItem, MealType, FoodCategory } from "../src/models";

describe("MonthlyMenu", () => {
  describe("getWeeklyMenuForDate", () => {
    let monthlyMenu: MonthlyMenu;
    let weeklyMenu1: WeeklyMenu;
    let weeklyMenu2: WeeklyMenu;
    let weeklyMenu3: WeeklyMenu;

    beforeEach(() => {
      // Create test WeeklyMenus
      // Week 1: Jan 1-7, 2024 (Monday-Sunday)
      weeklyMenu1 = new WeeklyMenu({
        startDate: "2024-01-01", // Monday
        endDate: "2024-01-07", // Sunday
        dailyMenus: [],
      });

      // Week 2: Jan 8-14, 2024 (Monday-Sunday)
      weeklyMenu2 = new WeeklyMenu({
        startDate: "2024-01-08", // Monday
        endDate: "2024-01-14", // Sunday
        dailyMenus: [],
      });

      // Week 3: Jan 15-21, 2024 (Monday-Sunday)
      weeklyMenu3 = new WeeklyMenu({
        startDate: "2024-01-15", // Monday
        endDate: "2024-01-21", // Sunday
        dailyMenus: [],
      });

      // Create MonthlyMenu with the weekly menus
      monthlyMenu = new MonthlyMenu({
        year: 2024,
        month: 1,
        weeklyMenus: [weeklyMenu1, weeklyMenu2, weeklyMenu3],
      });
    });

    describe("weekday scenarios", () => {
      it("should return the containing WeeklyMenu for Monday", () => {
        const monday = new Date(2024, 0, 1); // January 1, 2024 (Monday)
        const result = monthlyMenu.getWeeklyMenuForDate(monday);
        expect(result).toBe(weeklyMenu1);
      });

      it("should return the containing WeeklyMenu for Tuesday", () => {
        const tuesday = new Date(2024, 0, 2); // January 2, 2024 (Tuesday)
        const result = monthlyMenu.getWeeklyMenuForDate(tuesday);
        expect(result).toBe(weeklyMenu1);
      });

      it("should return the containing WeeklyMenu for Wednesday", () => {
        const wednesday = new Date(2024, 0, 3); // January 3, 2024 (Wednesday)
        const result = monthlyMenu.getWeeklyMenuForDate(wednesday);
        expect(result).toBe(weeklyMenu1);
      });

      it("should return the containing WeeklyMenu for Thursday", () => {
        const thursday = new Date(2024, 0, 4); // January 4, 2024 (Thursday)
        const result = monthlyMenu.getWeeklyMenuForDate(thursday);
        expect(result).toBe(weeklyMenu1);
      });

      it("should return the containing WeeklyMenu for Friday", () => {
        const friday = new Date(2024, 0, 5); // January 5, 2024 (Friday)
        const result = monthlyMenu.getWeeklyMenuForDate(friday);
        expect(result).toBe(weeklyMenu1);
      });

      it("should return the correct WeeklyMenu for a weekday in the second week", () => {
        const wednesday = new Date(2024, 0, 10); // January 10, 2024 (Wednesday)
        const result = monthlyMenu.getWeeklyMenuForDate(wednesday);
        expect(result).toBe(weeklyMenu2);
      });

      it("should return the correct WeeklyMenu for a weekday in the third week", () => {
        const friday = new Date(2024, 0, 19); // January 19, 2024 (Friday)
        const result = monthlyMenu.getWeeklyMenuForDate(friday);
        expect(result).toBe(weeklyMenu3);
      });
    });

    describe("weekend scenarios", () => {
      it("should return the following WeeklyMenu for Saturday", () => {
        const saturday = new Date(2024, 0, 6); // January 6, 2024 (Saturday)
        const result = monthlyMenu.getWeeklyMenuForDate(saturday);
        expect(result).toBe(weeklyMenu2); // Should return next week's menu
      });

      it("should return the following WeeklyMenu for Sunday", () => {
        const sunday = new Date(2024, 0, 7); // January 7, 2024 (Sunday)
        const result = monthlyMenu.getWeeklyMenuForDate(sunday);
        expect(result).toBe(weeklyMenu2); // Should return next week's menu
      });

      it("should return the following WeeklyMenu for Saturday in the second week", () => {
        const saturday = new Date(2024, 0, 13); // January 13, 2024 (Saturday)
        const result = monthlyMenu.getWeeklyMenuForDate(saturday);
        expect(result).toBe(weeklyMenu3); // Should return next week's menu
      });

      it("should return the following WeeklyMenu for Sunday in the second week", () => {
        const sunday = new Date(2024, 0, 14); // January 14, 2024 (Sunday)
        const result = monthlyMenu.getWeeklyMenuForDate(sunday);
        expect(result).toBe(weeklyMenu3); // Should return next week's menu
      });
    });

    describe("edge cases", () => {
      it("should return null when no WeeklyMenu contains the weekday date", () => {
        const dateOutOfRange = new Date(2024, 0, 25); // January 25, 2024 (Thursday)
        const result = monthlyMenu.getWeeklyMenuForDate(dateOutOfRange);
        expect(result).toBeNull();
      });

      it("should return null when no following WeeklyMenu exists for weekend", () => {
        const lastSaturday = new Date(2024, 0, 20); // January 20, 2024 (Saturday)
        const result = monthlyMenu.getWeeklyMenuForDate(lastSaturday);
        expect(result).toBeNull();
      });

      it("should return null when no following WeeklyMenu exists for Sunday", () => {
        const lastSunday = new Date(2024, 0, 21); // January 21, 2024 (Sunday)
        const result = monthlyMenu.getWeeklyMenuForDate(lastSunday);
        expect(result).toBeNull();
      });

      it("should work with empty weeklyMenus array", () => {
        const emptyMonthlyMenu = new MonthlyMenu({
          year: 2024,
          month: 1,
          weeklyMenus: [],
        });

        const monday = new Date(2024, 0, 1);
        const result = emptyMonthlyMenu.getWeeklyMenuForDate(monday);
        expect(result).toBeNull();
      });
    });

    describe("boundary conditions", () => {
      it("should work correctly for the first day of a WeeklyMenu", () => {
        const firstDay = new Date(2024, 0, 8); // January 8, 2024 (Monday - start of week 2)
        const result = monthlyMenu.getWeeklyMenuForDate(firstDay);
        expect(result).toBe(weeklyMenu2);
      });

      it("should work correctly for the last day of a WeeklyMenu", () => {
        const lastDay = new Date(2024, 0, 7); // January 7, 2024 (Sunday - end of week 1)
        const result = monthlyMenu.getWeeklyMenuForDate(lastDay);
        expect(result).toBe(weeklyMenu2); // Weekend should return following week
      });

      it("should work correctly for Friday before weekend", () => {
        const friday = new Date(2024, 0, 12); // January 12, 2024 (Friday)
        const result = monthlyMenu.getWeeklyMenuForDate(friday);
        expect(result).toBe(weeklyMenu2); // Should return containing week, not following
      });
    });

    describe("date validation", () => {
      it("should handle leap year dates correctly", () => {
        const leapYearMenu = new MonthlyMenu({
          year: 2024,
          month: 2,
          weeklyMenus: [
            new WeeklyMenu({
              startDate: "2024-02-26", // Monday
              endDate: "2024-03-03", // Sunday
              dailyMenus: [],
            }),
          ],
        });

        const leapDay = new Date(2024, 1, 29); // February 29, 2024 (Thursday)
        const result = leapYearMenu.getWeeklyMenuForDate(leapDay);
        expect(result).toBe(leapYearMenu.weeklyMenus[0]);
      });

      it("should handle year transitions correctly", () => {
        const yearEndMenu = new MonthlyMenu({
          year: 2023,
          month: 12,
          weeklyMenus: [
            new WeeklyMenu({
              startDate: "2023-12-25", // Monday
              endDate: "2023-12-31", // Sunday
              dailyMenus: [],
            }),
          ],
        });

        const newYearEve = new Date(2023, 11, 31); // December 31, 2023 (Sunday)
        const result = yearEndMenu.getWeeklyMenuForDate(newYearEve);
        expect(result).toBeNull(); // No following week in this monthly menu
      });
    });
  });

  describe("fromJSON static methods", () => {
    it("should properly reconstruct MenuItem from JSON", () => {
      const menuItemData = {
        name: "Pizza",
        description: "Cheese pizza",
        category: FoodCategory.MAIN_ENTREE,
        isVegetarian: true,
        isVegan: false,
        allergens: ["dairy"],
        nutritionalInfo: { calories: 300 },
      };

      const menuItem = MenuItem.fromJSON(menuItemData);
      expect(menuItem).toBeInstanceOf(MenuItem);
      expect(menuItem.name).toBe("Pizza");
      expect(menuItem.description).toBe("Cheese pizza");
      expect(menuItem.category).toBe(FoodCategory.MAIN_ENTREE);
      expect(menuItem.isVegetarian).toBe(true);
      expect(menuItem.isVegan).toBe(false);
      expect(menuItem.allergens).toEqual(["dairy"]);
      expect(menuItem.nutritionalInfo).toEqual({ calories: 300 });
    });

    it("should properly reconstruct DailyMenu from JSON", () => {
      const dailyMenuData = {
        date: "2024-01-01",
        mealType: MealType.LUNCH,
        menuItems: [
          {
            name: "Pizza",
            category: FoodCategory.MAIN_ENTREE,
            isVegetarian: true,
          },
        ],
        specialNotes: ["Note 1"],
        isSchoolDay: true,
      };

      const dailyMenu = DailyMenu.fromJSON(dailyMenuData);
      expect(dailyMenu).toBeInstanceOf(DailyMenu);
      expect(dailyMenu.mealType).toBe(MealType.LUNCH);
      expect(dailyMenu.menuItems).toHaveLength(1);
      expect(dailyMenu.menuItems[0]).toBeInstanceOf(MenuItem);
      expect(dailyMenu.menuItems[0].name).toBe("Pizza");
      expect(dailyMenu.specialNotes).toEqual(["Note 1"]);
      expect(dailyMenu.isSchoolDay).toBe(true);
    });

    it("should properly reconstruct WeeklyMenu from JSON", () => {
      const weeklyMenuData = {
        startDate: "2024-01-01",
        endDate: "2024-01-07",
        dailyMenus: [
          {
            date: "2024-01-01",
            mealType: MealType.LUNCH,
            menuItems: [
              {
                name: "Pizza",
                category: FoodCategory.MAIN_ENTREE,
              },
            ],
          },
        ],
      };

      const weeklyMenu = WeeklyMenu.fromJSON(weeklyMenuData);
      expect(weeklyMenu).toBeInstanceOf(WeeklyMenu);
      expect(weeklyMenu.dailyMenus).toHaveLength(1);
      expect(weeklyMenu.dailyMenus[0]).toBeInstanceOf(DailyMenu);
      expect(weeklyMenu.dailyMenus[0].menuItems[0]).toBeInstanceOf(MenuItem);
      expect(weeklyMenu.dailyMenus[0].menuItems[0].name).toBe("Pizza");
    });

    it("should properly reconstruct MonthlyMenu from JSON", () => {
      const monthlyMenuData = {
        year: 2024,
        month: 1,
        weeklyMenus: [
          {
            startDate: "2024-01-01",
            endDate: "2024-01-07",
            dailyMenus: [
              {
                date: "2024-01-01",
                mealType: MealType.LUNCH,
                menuItems: [
                  {
                    name: "Pizza",
                    category: FoodCategory.MAIN_ENTREE,
                  },
                ],
              },
            ],
          },
        ],
      };

      const monthlyMenu = MonthlyMenu.fromJSON(monthlyMenuData);
      expect(monthlyMenu).toBeInstanceOf(MonthlyMenu);
      expect(monthlyMenu.year).toBe(2024);
      expect(monthlyMenu.month).toBe(1);
      expect(monthlyMenu.weeklyMenus).toHaveLength(1);
      expect(monthlyMenu.weeklyMenus[0]).toBeInstanceOf(WeeklyMenu);
      expect(monthlyMenu.weeklyMenus[0].dailyMenus[0]).toBeInstanceOf(DailyMenu);
      expect(monthlyMenu.weeklyMenus[0].dailyMenus[0].menuItems[0]).toBeInstanceOf(MenuItem);
      expect(monthlyMenu.weeklyMenus[0].dailyMenus[0].menuItems[0].name).toBe("Pizza");
    });

    it("should handle JSON serialization/deserialization round-trip", () => {
      const originalMonthlyMenu = new MonthlyMenu({
        year: 2024,
        month: 1,
        weeklyMenus: [
          new WeeklyMenu({
            startDate: "2024-01-01",
            endDate: "2024-01-07",
            dailyMenus: [
              new DailyMenu({
                date: "2024-01-01",
                mealType: MealType.LUNCH,
                menuItems: [
                  new MenuItem({
                    name: "Pizza",
                    category: FoodCategory.MAIN_ENTREE,
                    isVegetarian: true,
                  }),
                ],
              }),
            ],
          }),
        ],
      });

      // Convert to JSON and back
      const jsonString = JSON.stringify(originalMonthlyMenu.toJSON());
      const parsedData = JSON.parse(jsonString);
      const reconstructedMonthlyMenu = MonthlyMenu.fromJSON(parsedData);

      // Verify the reconstructed menu has all the methods
      expect(reconstructedMonthlyMenu).toBeInstanceOf(MonthlyMenu);
      expect(reconstructedMonthlyMenu.getWeeklyMenuForDate).toBeInstanceOf(Function);

      const weeklyMenu = reconstructedMonthlyMenu.weeklyMenus[0];
      expect(weeklyMenu).toBeInstanceOf(WeeklyMenu);
      expect(weeklyMenu.getMealsByWeekday).toBeInstanceOf(Function);

      const dailyMenu = weeklyMenu.dailyMenus[0];
      expect(dailyMenu).toBeInstanceOf(DailyMenu);
      expect(dailyMenu.addMenuItem).toBeInstanceOf(Function);

      const menuItem = dailyMenu.menuItems[0];
      expect(menuItem).toBeInstanceOf(MenuItem);
      expect(menuItem.name).toBe("Pizza");
    });
  });
});
