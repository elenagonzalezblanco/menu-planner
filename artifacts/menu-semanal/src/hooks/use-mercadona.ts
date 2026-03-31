// Mercadona integration requires a backend — stub returns empty for GitHub Pages static build
export function useSearchMercadona() {
  return {
    data: null,
    isLoading: false,
    isPending: false,
    error: null,
    isError: false,
    isSuccess: true,
  };
}
