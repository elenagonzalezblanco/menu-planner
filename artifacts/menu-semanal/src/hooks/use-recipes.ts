import { useQueryClient } from "@tanstack/react-query";
import { 
  useListRecipes, 
  useCreateRecipe as useGeneratedCreateRecipe,
  useUpdateRecipe as useGeneratedUpdateRecipe,
  useDeleteRecipe as useGeneratedDeleteRecipe,
  getListRecipesQueryKey
} from "@workspace/api-client-react";

export function useRecipes(category?: string) {
  return useListRecipes(category ? { category } : undefined);
}

export function useCreateRecipe() {
  const queryClient = useQueryClient();
  return useGeneratedCreateRecipe({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListRecipesQueryKey() });
      }
    }
  });
}

export function useUpdateRecipe() {
  const queryClient = useQueryClient();
  return useGeneratedUpdateRecipe({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListRecipesQueryKey() });
      }
    }
  });
}

export function useDeleteRecipe() {
  const queryClient = useQueryClient();
  return useGeneratedDeleteRecipe({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListRecipesQueryKey() });
      }
    }
  });
}
