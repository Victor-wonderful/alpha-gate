import { redirect } from "next/navigation";

// /app/market merged into the home dashboard. Keep the route for bookmarks but
// send users to the unified home, scrolled to the market section.
export default function MarketPage() {
  redirect("/app#market");
}
