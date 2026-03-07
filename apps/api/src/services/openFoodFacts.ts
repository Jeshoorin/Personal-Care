import axios from "axios";

export interface FoodSearchResult {
  name: string;
  calories: number;
  source: "openfoodfacts";
}

export async function searchFoodCalories(query: string): Promise<FoodSearchResult[]> {
  if (!query.trim()) return [];
  const response = await axios.get("https://world.openfoodfacts.org/cgi/search.pl", {
    params: {
      search_terms: query,
      search_simple: 1,
      action: "process",
      json: 1,
      page_size: 10
    },
    timeout: 5000
  });

  const products = (response.data.products ?? []) as Array<Record<string, unknown>>;
  return products
    .map((product) => {
      const name = String(product.product_name ?? product.generic_name ?? "").trim();
      const nutriments = product.nutriments as Record<string, unknown> | undefined;
      const calories = Number(nutriments?.["energy-kcal_100g"] ?? NaN);
      if (!name || Number.isNaN(calories)) return null;
      return {
        name,
        calories: Math.round(calories),
        source: "openfoodfacts" as const
      };
    })
    .filter((item): item is FoodSearchResult => Boolean(item));
}
