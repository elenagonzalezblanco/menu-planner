import { useGetShoppingList } from "@workspace/api-client-react";
import { useUser } from "@/contexts/UserContext";

export { useGenerateShoppingList } from "@workspace/api-client-react";

export function useShoppingList(menuId: number) {
  const { currentUser } = useUser();
  return useGetShoppingList(menuId, {
    request: { headers: { "X-User-Id": String(currentUser?.id ?? "") } },
    query: {
      queryKey: ["/api/shopping-list", currentUser?.id, menuId],
      enabled: !!currentUser,
      refetchInterval: 10_000,
    },
  });
}
