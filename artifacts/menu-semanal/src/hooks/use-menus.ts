import { useQueryClient } from "@tanstack/react-query";
import { 
  useListMenus, 
  useGetMenu,
  useGenerateMenu as useGeneratedGenerateMenu,
  getListMenusQueryKey
} from "@workspace/api-client-react";

export function useMenus() {
  return useListMenus();
}

export function useMenu(id: number) {
  return useGetMenu(id, { query: { enabled: !!id } });
}

export function useGenerateMenu() {
  const queryClient = useQueryClient();
  return useGeneratedGenerateMenu({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListMenusQueryKey() });
      }
    }
  });
}
