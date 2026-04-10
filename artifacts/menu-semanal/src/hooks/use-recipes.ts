import { useQueryClient } from "@tanstack/react-query";
import {
  useListRecipes,
  useCreateRecipe as useCreateRecipeBase,
  useUpdateRecipe as useUpdateRecipeBase,
  useDeleteRecipe as useDeleteRecipeBase,
  getListRecipesQueryKey,
} from "@workspace/api-client-react";

export { useListRecipes as useRecipes };

export function useCreateRecipe() {
  const queryClient = useQueryClient();
  return useCreateRecipeBase({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListRecipesQueryKey() });
      },
    },
  });
}

export function useUpdateRecipe() {
  const queryClient = useQueryClient();
  return useUpdateRecipeBase({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListRecipesQueryKey() });
      },
    },
  });
}

export function useDeleteRecipe() {
  const queryClient = useQueryClient();
  return useDeleteRecipeBase({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListRecipesQueryKey() });
      },
    },
  });
}
