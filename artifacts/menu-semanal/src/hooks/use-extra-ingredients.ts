import { useState, useEffect } from "react";

const storageKey = (menuId: string | number) => `extra-ingredients-${menuId}`;

export function useExtraIngredients(menuId: string | number | null | undefined) {
  const [items, setItems] = useState<string[]>([]);

  useEffect(() => {
    if (!menuId) { setItems([]); return; }
    try {
      const stored = localStorage.getItem(storageKey(menuId));
      setItems(stored ? JSON.parse(stored) : []);
    } catch {
      setItems([]);
    }
  }, [menuId]);

  const add = (ingredient: string) => {
    if (!menuId) return;
    const trimmed = ingredient.trim();
    if (!trimmed) return;
    setItems(prev => {
      if (prev.includes(trimmed)) return prev;
      const next = [...prev, trimmed];
      localStorage.setItem(storageKey(menuId), JSON.stringify(next));
      return next;
    });
  };

  const remove = (ingredient: string) => {
    if (!menuId) return;
    setItems(prev => {
      const next = prev.filter(i => i !== ingredient);
      localStorage.setItem(storageKey(menuId), JSON.stringify(next));
      return next;
    });
  };

  return { items, add, remove };
}
