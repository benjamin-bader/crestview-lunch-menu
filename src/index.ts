import { Hono } from "hono";
import { html } from "hono/html";
import { TrmnlUser } from "./db";
import { MealType, DailyMenu, DailyMeals, MonthlyMenu, Weekday, WeeklyMenu, getWeekdayName } from "./models";
import { StreamingScraper } from "./streaming_scraper";
import { format, addDays } from "date-fns";

const app = new Hono<{ Bindings: CloudflareBindings }>();

const MENU_PATH = "menus/cve.json";
const MARKUP_PATH = "markup/cve.json";

let FAKE_NOW: Date | null = new Date("2025-03-01");// null;

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

  if (!code || !callbackUrl) {
    return c.json({ error: "Missing required parameters" }, 400);
  }

  const body = {
    code,
    client_id: c.env.CLIENT_ID,
    client_secret: c.env.CLIENT_SECRET,
    grant_type: "authorization_code",
  };

  const payload = JSON.stringify(body);

  const response = await fetch("https://usetrmnl.com/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: payload,
  });

  const data: Record<string, any> = await response.json();
  const accessToken = data.access_token as string;

  const user = new TrmnlUser({ accessToken, uuid: null, pluginSettingId: null });
  await user.create(c.env.DB);

  return c.redirect(callbackUrl);
});

app.post("/api/install-success", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const accessToken = authHeader.split(" ")[1];
  if (!accessToken) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const user = await TrmnlUser.findByAccessToken(c.env.DB, accessToken);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const payload = await c.req.json();
  const { uuid, plugin_setting_id } = payload.user;
  if (!uuid || !plugin_setting_id) {
    return c.json({ error: "Missing required parameters" }, 400);
  }

  await user.setUuidAndPluginSettingId(c.env.DB, uuid as string, plugin_setting_id as number);

  return c.json({ success: true });
});

app.post("/api/uninstall", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const accessToken = authHeader.split(" ")[1];

  const payload = await c.req.json();
  const { user_uuid } = payload;

  if (accessToken && user_uuid) {
    TrmnlUser.deleteByUuidAndAccessToken(c.env.DB, user_uuid, accessToken);
  } else {
    console.error("Missing required parameters", payload);
  }

  return c.json({ success: true });
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

// Helper function to get the date for a specific weekday in the weekly menu
function getDateForWeekday(weeklyMenu: WeeklyMenu, weekday: Weekday): Date {
  // WeeklyMenu.startDate is always Monday (weekday 1)
  // Calculate the offset from Monday to the target weekday
  const mondayOffset = weekday - 1; // Monday = 1, so offset is 0 for Monday
  return addDays(weeklyMenu.startDate, mondayOffset);
}

// Helper function to create a column for a specific weekday
function createWeekdayColumn(weeklyMenu: WeeklyMenu, weekday: Weekday) {
  const weekdayName = getWeekdayName(weekday);
  const date = getDateForWeekday(weeklyMenu, weekday);
  const formattedDate = format(date, "MMM d");
  const meals = weeklyMenu.getMealsByWeekday(weekday);

  return html`
    <div class="column">
      <span class="title">${weekdayName}</span>
      <span class="description">${formattedDate}</span>
      ${meals.breakfast && meals.breakfast.menuItems.length > 0
        ? html`
            <span class="title title--small">Breakfast</span>
            ${meals.breakfast.menuItems.map((item) => html`<div>${item.name}</div>`)}
          `
        : html`
            <span class="title title--small">Breakfast</span>
            <div>&lt;No data&gt;</div>
          `}
      ${meals.lunch && meals.lunch.menuItems.length > 0
        ? html`
            <span class="title title--small">Lunch</span>
            ${meals.lunch.menuItems.map((item) => html`<div>${item.name}</div>`)}
          `
        : html`
            <span class="title title--small">Lunch</span>
            <div>&lt;No data&gt;</div>
          `}
    </div>
  `;
}

const fullLayout = (menu: WeeklyMenu) => html`
  <div class="layout layout--stretch-y columns text--center">
    ${createWeekdayColumn(menu, Weekday.MONDAY)} ${createWeekdayColumn(menu, Weekday.TUESDAY)}
    ${createWeekdayColumn(menu, Weekday.WEDNESDAY)} ${createWeekdayColumn(menu, Weekday.THURSDAY)}
    ${createWeekdayColumn(menu, Weekday.FRIDAY)}
  </div>

  <div class="title_bar">
    <span class="title">BVSD Lunch Menu - Crest View Elementary</span>
  </div>
`;

const halfHorizontalLayout = (menu: WeeklyMenu) => {
  const { first, second } = getHalfVerticalWeekdays(currentDate());

  return html`
    <div class="layout layout--stretch-y">
      <div class="columns">
        ${createQuadrantColumn(menu, first)}
        ${second ? createQuadrantColumn(menu, second) : html`<div class="column"></div>`}
      </div>
    </div>

    <div class="title_bar">
      <span class="title">BVSD Lunch Menu - Crest View Elementary</span>
    </div>
  `;
};

// Helper function to get the next weekday
function getNextWeekday(weekday: Weekday): Weekday | null {
  if (weekday >= Weekday.FRIDAY) {
    return null; // No next weekday in the same week
  }
  return (weekday + 1) as Weekday;
}

// Helper function to get the two days to show for half vertical layout
function getHalfVerticalWeekdays(date: Date): { first: Weekday; second: Weekday | null } {
  const firstWeekday = getQuadrantWeekday(date);
  const secondWeekday = getNextWeekday(firstWeekday);

  return { first: firstWeekday, second: secondWeekday };
}

const halfVerticalLayout = (menu: WeeklyMenu) => {
  const { first, second } = getHalfVerticalWeekdays(currentDate());

  return html`
    <div class="layout layout--stretch-y columns text--center">
      ${createWeekdayColumn(menu, first)} ${second ? createWeekdayColumn(menu, second) : ""}
    </div>

    <div class="title_bar">
      <span class="title">BVSD Lunch Menu - Crest View Elementary</span>
    </div>
  `;
};

// Helper function to determine which weekday to show for quadrant layout
function getQuadrantWeekday(date: Date): Weekday {
  const dayOfWeek = date.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday

  // If it's weekend (Saturday or Sunday), show next Monday
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return Weekday.MONDAY;
  }

  // Otherwise, show current day (convert JS day to our Weekday enum)
  // JS: 1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, 5=Friday
  // Our enum: 1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, 5=Friday
  return dayOfWeek as Weekday;
}

// Helper function to create a column for quadrant layout with specific styling
function createQuadrantColumn(weeklyMenu: WeeklyMenu, weekday: Weekday) {
  const weekdayName = getWeekdayName(weekday);
  const date = getDateForWeekday(weeklyMenu, weekday);
  const formattedDate = format(date, "M/d");
  const meals = weeklyMenu.getMealsByWeekday(weekday);

  return html`
    <div class="column">
      <div class="flex gap--small">
        <span class="title">${weekdayName}</span>
        <span class="description">${formattedDate}</span>
      </div>
      ${meals.breakfast && meals.breakfast.menuItems.length > 0
        ? html`
            <span class="title title--small">Breakfast</span>
            <span class="description clamp--1">${meals.breakfast.menuItems.map((item) => item.name).join(" or ")}</span>
          `
        : html`
            <span class="title title--small">Breakfast</span>
            <span class="description clamp--1">&lt;No data&gt;</span>
          `}
      ${meals.lunch && meals.lunch.menuItems.length > 0
        ? html`
            <span class="title title--small">Lunch</span>
            ${meals.lunch.menuItems.map((item) => html`<div class="description clamp--1">${item.name}</div>`)}
          `
        : html`
            <span class="title title--small">Lunch</span>
            <div class="description clamp--1">&lt;No data&gt;</div>
          `}
    </div>
  `;
}

const quadrantLayout = (menu: WeeklyMenu) => {
  const targetWeekday = getQuadrantWeekday(currentDate());

  return html`
    <div class="columns layout layout--stretch-y">${createQuadrantColumn(menu, targetWeekday)}</div>

    <div class="title_bar">
      <span class="title">BVSD Lunch Menu - Crest View Elementary</span>
    </div>
  `;
};

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
  console.log("markup BEGIN");
  const authHeader = c.req.header("Authorization");
  const uuid = c.req.query("uuid");

  if (!authHeader || !uuid) {
    console.error("Unauthorized", authHeader, uuid);
    return c.json({ error: "Unauthorized" }, 401);
  }

  const accessToken = authHeader.split(" ")[1];
  if (!accessToken) {
    console.error("Unauthorized", authHeader, uuid);
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

// Catch-all fallback route
app.all("*", (c) => {
  console.log("No handler matched:", c.req.method, new URL(c.req.url).pathname);
  return c.text("Matched, but not found", 404);
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
