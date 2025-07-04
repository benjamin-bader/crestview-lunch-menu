# Crest View Elementary School Lunch Menu - TRMNL Plugin

A TypeScript-based TRMNL plugin that scrapes and displays lunch menu data from Crest View Elementary School (Boulder Valley School District) on your TRMNL device.

## Overview

This project is a **TRMNL plugin** that:
- Scrapes lunch menu data from the school's website using Cloudflare Workers
- Stores menu data in Cloudflare R2 storage
- Serves formatted HTML for display on TRMNL devices in multiple layouts
- Runs scheduled updates to keep menu data current

## Installation & Setup

### Prerequisites
- Node.js and npm/yarn
- Cloudflare Workers account
- TRMNL account and device

### Local Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Deploy to Cloudflare Workers
npm run deploy
```

### Configuration

The project uses `wrangler.jsonc` for configuration:

```jsonc
{
  "name": "crestview-lunch-menu",
  "r2_buckets": [
    {
      "binding": "MENU_DATA", 
      "bucket_name": "lunch-menus"
    }
  ],
  "triggers": {
    "crons": ["0 8 * * *"]  // Daily at 8 AM UTC
  }
}
```

## Data Model

### Menu Hierarchy
```
MonthlyMenu
├── WeeklyMenu[]
    ├── DailyMenu[]
        ├── MenuItem[]
```

### Meal Types
- **Breakfast**: Morning meals
- **Lunch**: Midday meals  
- **Snack**: After-school snacks

### Food Categories
- Main Entree
- Vegetarian Entree
- Elementary/Secondary Second Choice
- Elementary/Secondary Side Dish
- Afterschool Snack
- Preschool Snack
- SAC Snack

### Example Usage

```typescript
import { StreamingScraper } from './src/streaming_scraper';

const scraper = new StreamingScraper();
const menu = await scraper.fetchAllMealsForDateAjax(new Date('2025-05-01'));

// Access menu data
const dailyMenus = menu.getAllDailyMenus();
for (const daily of dailyMenus) {
  console.log(`${daily.date}: ${daily.mealType}`);
  daily.menuItems.forEach(item => {
    console.log(`  - ${item.name} (${item.category})`);
  });
}
```

## How It Works

### Scraping Process

1. **AJAX Endpoint Discovery**: Uses discovered AJAX endpoints for each meal type:
   - Breakfast: `/fs/elements/74972`
   - Lunch: `/fs/elements/74979`
   - Snack: `/fs/elements/74986`

2. **HTMLRewriter Processing**: Streams HTML parsing using Cloudflare Workers' HTMLRewriter API for efficient processing

3. **Data Extraction**: Extracts menu items, dates, and food categories from the school's calendar system

4. **Color-Based Categorization**: Maps background colors to food categories:
   - Blue (`#220AFD`): Main Entree
   - Green (`#52B73E`): Vegetarian Entree
   - Black (`#000000`): Second Choice
   - Yellow (`#EFE013`): Side Dish
   - Red variations: Snacks

### Scheduled Updates

The worker runs daily at 8 AM UTC to:
- Fetch current/upcoming week's menu data
- Store data in R2 bucket
- Prepare data for TRMNL device display

### TRMNL Integration

The plugin provides multiple layout options:
- **Full Layout**: Complete weekly menu in table format
- **Half Layouts**: Condensed versions for smaller displays
- **Quadrant Layout**: Minimal view for corner displays

## Development

### Project Structure

```
src/
├── index.ts              # Main Hono application & routes
├── models.ts             # Data models (MenuItem, DailyMenu, etc.)
├── streaming_scraper.ts  # HTMLRewriter-based scraper
└── worker-configuration.d.ts  # TypeScript definitions

public/
├── index.html           # Basic web interface
└── manage.html          # Management interface
```

### Running Tests

```bash
# Run the scraper directly
curl https://your-worker.workers.dev/scrape/2025-05-01

# Test with debug information
curl https://your-worker.workers.dev/debug/streaming/2025-05-01
```

### Deployment

```bash
# Deploy to production
npm run deploy

# Deploy with minification
npm run deploy -- --minify
```

## Configuration

### Environment Variables

Set in `wrangler.jsonc`:
- `ENVIRONMENT`: "production" or "development"

### Custom Domain

Configure in `wrangler.jsonc`:
```jsonc
"routes": [
  {
    "pattern": "bvsd-menus.bendb.com",
    "custom_domain": true
  }
]
```

## License

This project is for educational purposes and personal use. Licensed under the GPL v3 License - see the [LICENSE.md](LICENSE.md) file for details.

## About TRMNL

[TRMNL](https://usetrmnl.com/) is a modern e-ink display that shows personalized information in a clean, distraction-free format. This plugin extends TRMNL's capabilities to display school lunch menus for families with school-aged children.

---

© 2025 Benjamin Bader. All rights reserved.
