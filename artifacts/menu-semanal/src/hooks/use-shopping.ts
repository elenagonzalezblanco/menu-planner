import { useQueryClient } from "@tanstack/react-query";
import { 
  useGetShoppingList,
  useGenerateShoppingList as useGeneratedGenerateShoppingList,
  getGetShoppingListQueryKey
} from "@workspace/api-client-react";

export function useShoppingList(menuId: number) {
  return useGetShoppingList(menuId, { query: { enabled: !!menuId } });
}

export function useGenerateShoppingList() {
  const queryClient = useQueryClient();
  return useGeneratedGenerateShoppingList({
    mutation: {
      onSuccess: (_, variables) => {
        queryClient.invalidateQueries({ 
          queryKey: getGetShoppingListQueryKey(variables.data.menuId) 
        });
      }
    }
  });
}
