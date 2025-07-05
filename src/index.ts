import { Hono } from "hono";
import { html } from "hono/html";
import { MealType, DailyMenu, DailyMeals, MonthlyMenu, TrmnlUser, Weekday, WeeklyMenu } from "./models";
import { StreamingScraper } from "./streaming_scraper";

const app = new Hono<{ Bindings: CloudflareBindings }>();

const MENU_PATH = "menus/cve.json";
const MARKUP_PATH = "markup/cve.json";

let FAKE_NOW: Date | null = null;

const currentDate = () => FAKE_NOW || new Date();

app.use("*", async (c, next) => {
  const maybeNow = c.req.query("now");
  if (maybeNow) {
    FAKE_NOW = new Date(maybeNow);
  }

  return next();
});

app.get("/api/install", async (c) => {
  const code = c.req.query("code");
  const callbackUrl = c.req.query("installation_callback_url");

  const body = {
    code: "",
    client_id: c.env.CLIENT_ID,
    client_secret: c.env.CLIENT_SECRET,
    grant_type: "authorization_code",
  };

  // POST this body to https://api.trmnl.com/oauth/token
  const response = await fetch("https://api.trmnl.com/oauth/token", {
    method: "POST",
    body: JSON.stringify(body),
  });

  const data: Record<string, any> = await response.json();
  const accessToken = data["access_token"] as string;
});

app.post("/api/install-success", async (c) => {
  c.req.json();
  return c.redirect("/");
});

app.post("/api/uninstall", async (c) => {
  return c.redirect("/");
});

app.get("/message", (c) => {
  return c.text("Hello Hono!");
});

app.post("/api/seed/:date", async (c) => {
  const dateParam = c.req.param("date");
  const targetDate = new Date(dateParam);
  const scraper = new StreamingScraper();
  const monthlyMenu = await scraper.fetchAllMealsForDateAjax(targetDate);
  if (monthlyMenu) {
    await c.env.MENU_DATA.put(MENU_PATH, JSON.stringify(monthlyMenu));
  }

  return c.json({ success: monthlyMenu ? true : false });
});

// Test the scraper endpoint
app.get("/scrape/:date", async (c) => {
  const dateParam = c.req.param("date");
  const targetDate = new Date(dateParam);

  if (isNaN(targetDate.getTime())) {
    return c.json({ error: "Invalid date format. Use YYYY-MM-DD" }, 400);
  }

  try {
    const scraper = new StreamingScraper();
    const monthlyMenu = await scraper.fetchAllMealsForDateAjax(targetDate);

    if (!monthlyMenu) {
      return c.json({ error: "No menu data found for the specified date" }, 404);
    }

    return c.json({
      success: true,
      date: dateParam,
      menu: monthlyMenu.toJSON(),
      summary: {
        totalDailyMenus: monthlyMenu.getAllDailyMenus().length,
        weeklyMenusCount: monthlyMenu.weeklyMenus.length,
      },
    });
  } catch (error) {
    console.error("Scraping error:", error);
    return c.json(
      {
        error: "Failed to scrape menu data",
        details: error instanceof Error ? error.message : String(error),
      },
      500
    );
  }
});

// Debug endpoint - New HTMLRewriter-based streaming scraper
app.get("/debug/streaming/:date", async (c) => {
  const dateParam = c.req.param("date");
  const targetDate = new Date(dateParam);

  if (isNaN(targetDate.getTime())) {
    return c.json({ error: "Invalid date format. Use YYYY-MM-DD" }, 400);
  }

  const startTime = performance.now();

  try {
    const scraper = new StreamingScraper();
    const monthlyMenu = await scraper.fetchAllMealsForDateAjax(targetDate);

    const endTime = performance.now();
    const executionTime = endTime - startTime;

    if (!monthlyMenu) {
      return c.json(
        {
          error: "No menu data found for the specified date",
          scraper: "streaming",
          executionTime: `${executionTime.toFixed(2)}ms`,
        },
        404
      );
    }

    const allDailyMenus = monthlyMenu.getAllDailyMenus();

    return c.json({
      success: true,
      scraper: "streaming",
      date: dateParam,
      executionTime: `${executionTime.toFixed(2)}ms`,
      menu: monthlyMenu.toJSON(),
      summary: {
        totalDailyMenus: allDailyMenus.length,
        weeklyMenusCount: monthlyMenu.weeklyMenus.length,
        menuItemsCount: allDailyMenus.reduce((sum, menu) => sum + menu.menuItems.length, 0),
        mealTypeBreakdown: {
          breakfast: allDailyMenus.filter((m) => m.mealType === MealType.BREAKFAST).length,
          lunch: allDailyMenus.filter((m) => m.mealType === MealType.LUNCH).length,
          snack: allDailyMenus.filter((m) => m.mealType === MealType.SNACK).length,
        },
      },
    });
  } catch (error) {
    const endTime = performance.now();
    const executionTime = endTime - startTime;

    console.error("Streaming scraping error:", error);
    return c.json(
      {
        error: "Failed to scrape menu data",
        scraper: "streaming",
        executionTime: `${executionTime.toFixed(2)}ms`,
        details: error instanceof Error ? error.message : String(error),
      },
      500
    );
  }
});

// Health check endpoint
app.get("/health", (c) => {
  return c.json({
    status: "healthy",
    timestamp: currentDate().toISOString(),
  });
});

const breakfastContent = (menu: DailyMenu) => {
  return html`
    <div>
      <span class="title">Breakfast</span>
      ${menu.menuItems.map((item) => html`<div>${item.name}</div>`)}
    </div>
  `;
};

const lunchContent = (menu: DailyMenu) => {
  return html`
    <div>
      <span class="title">Lunch</span>
      ${menu.menuItems.map((item) => html`<div>${item.name}</div>`)}
    </div>
  `;
};

const snackContent = (menu: DailyMenu) => {
  return html`
    <div>
      <span class="title">Snack</span>
      ${menu.menuItems.map((item) => html`<div>${item.name}</div>`)}
    </div>
  `;
};

const mealDayContent = (meals: DailyMeals) => {
  const sections = [];

  // Add breakfast if it exists and has items
  if (meals.breakfast && meals.breakfast.menuItems.length > 0) {
    sections.push(breakfastContent(meals.breakfast));
  }

  // Add lunch if it exists and has items
  if (meals.lunch && meals.lunch.menuItems.length > 0) {
    sections.push(lunchContent(meals.lunch));
  }

  // Add snack if it exists and has items
  if (meals.snack && meals.snack.menuItems.length > 0) {
    sections.push(snackContent(meals.snack));
  }

  return html` ${sections} `;
};

function tableRow(menu: WeeklyMenu, weekday: Weekday) {
  const meals = menu.getMealsByWeekday(weekday);
  return html` <td>${mealDayContent(meals)}</td> `;
}

const fullLayout = (menu: WeeklyMenu) => html`
  <div class="layout layout--stretch">
    <table class="table">
      <thead>
        <tr>
          <th>Monday</th>
          <th>Tuesday</th>
          <th>Wednesday</th>
          <th>Thursday</th>
          <th>Friday</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          ${tableRow(menu, Weekday.MONDAY)} ${tableRow(menu, Weekday.TUESDAY)} ${tableRow(menu, Weekday.WEDNESDAY)}
          ${tableRow(menu, Weekday.THURSDAY)} ${tableRow(menu, Weekday.FRIDAY)}
        </tr>
      </tbody>
    </table>
  </div>

  <div class="title_bar">
    <span class="title">BVSD Lunch Menu - Crest View Elementary</span>
  </div>
`;

const halfHorizontalLayout = (menu: WeeklyMenu) => html`
  <div class="layout layout--top"></div>

  <div class="title_bar">
    <span class="title">BVSD Lunch Menu - Crest View Elementary</span>
  </div>
`;

const halfVerticalLayout = (menu: WeeklyMenu) => html`
  <div class="layout layout--top"></div>

  <div class="title_bar">
    <span class="title">BVSD Lunch Menu - Crest View Elementary</span>
  </div>
`;

const quadrantLayout = (menu: WeeklyMenu) => html`
  <div class="layout layout--top"></div>

  <div class="title_bar">
    <span class="title">BVSD Lunch Menu - Crest View Elementary</span>
  </div>
`;

app.get("/api/debug-layout", async (c) => {
  const scraper = new StreamingScraper();
  const menu = await scraper.fetchAllMealsForDateAjax(new Date("2025-05-01"));
  const weeklyMenu = menu?.weeklyMenus[0];
  if (!weeklyMenu) {
    return c.json({ error: "No weekly menu found" }, 404);
  }

  // const menu = new WeeklyMenu({startDate: "2025-05-01", endDate: "2025-05-07", dailyMenus: []});
  return c.html(fullLayout(weeklyMenu));
});

app.post("/api/markup", async (c) => {
  const token = c.req.header("Authorization");
  const uuid = c.req.query("uuid");

  if (!token || !uuid) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  // TODO: Look up user in R2 and validate token
  const monthlyMenuJson = await c.env.MENU_DATA.get(MENU_PATH);
  if (!monthlyMenuJson) {
    console.error("No menu data found");
    return c.json({ error: "No menu data found" }, 404);
  }

  let monthlyMenu: MonthlyMenu;
  try {
    const monthlyMenuData = await monthlyMenuJson.json();
    monthlyMenu = MonthlyMenu.fromJSON(monthlyMenuData);
  } catch (error) {
    console.error("Error parsing menu data", error);
    return c.json({ error: "Error parsing menu data" }, 500);
  }

  const menu = monthlyMenu.getWeeklyMenuForDate(currentDate());
  if (!menu) {
    console.error("No weekly menu found for date", currentDate());
    return c.json({ error: "No weekly menu found" }, 404);
  }

  const markup = {
    markup: fullLayout(menu).toString(),
    markup_half_horizontal: halfHorizontalLayout(menu).toString(),
    markup_half_vertical: halfVerticalLayout(menu).toString(),
    markup_quadrant: quadrantLayout(menu).toString(),
  };

  return c.json(markup);
});

export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledEvent, env: Cloudflare.Env, ctx: ExecutionContext) {
    try {
      const scraper = new StreamingScraper();
      const monthlyMenu = await scraper.fetchAllMealsForDateAjax(currentDate());
      if (monthlyMenu) {
        await env.MENU_DATA.put(MENU_PATH, JSON.stringify(monthlyMenu));
      } else {
        console.log("No menu found for scheduled run");
      }
    } catch (error) {
      console.error("Error in scheduled function:", error);
    }
  },
};
