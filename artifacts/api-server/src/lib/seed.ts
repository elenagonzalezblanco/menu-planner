import { db, recipesTable } from "@workspace/db";
import { logger } from "./logger";

const RECIPES = [
  { name: "Sopa de cebolla", category: "primero", ingredients: ["Cebollas", "Harina", "Mantequilla", "Vino blanco", "Queso gouda"], instructions: "" },
  { name: "Sopa de calabacín", category: "primero", ingredients: ["Calabacín", "Cebolla frita", "Quesitos", "Patata"], instructions: "" },
  { name: "Sopa de letras", category: "primero", ingredients: ["Hueso de jamón para el caldo", "Puerros", "Zanahorias", "Cebollas", "Fideos o letras"], instructions: "" },
  { name: "Salmorejo", category: "primero", ingredients: ["Tomate", "Pan", "Cebolla"], instructions: "" },
  { name: "Vichyssoise", category: "primero", ingredients: ["Puerros", "Patatas", "Leche ideal", "Nata liquida"], instructions: "" },
  { name: "Puré de verdura", category: "primero", ingredients: ["Patatas", "Calabacín", "Judías verdes", "Zanahorias", "1 puerro", "Pollos o ternera", "Cebolla o tomate"], instructions: "" },
  { name: "Quiche", category: "primero", ingredients: ["Hojaldre", "Bacon en trocitos", "Nata", "Huevos", "Queso gouda"], instructions: "" },
  { name: "Gazpacho", category: "primero", ingredients: ["Tomates", "1 pepino", "2 pimientos", "2 ajos"], instructions: "" },
  { name: "Crema de zanahoria", category: "primero", ingredients: ["Zanahorias", "1 puerro", "Queso Philadelphia", "1 patata", "1/2 avecrem"], instructions: "" },
  { name: "Consomé", category: "primero", ingredients: ["Hueso", "Medio pollo", "Estrellitas", "Zanahorias", "Trozo de ternera"], instructions: "" },
  { name: "Ensalada griega", category: "primero", ingredients: ["Tomates", "Pepino 1", "Pimiento verde 1", "1 cebolla pequeña", "Queso feta", "Aceitunas negras"], instructions: "" },
  { name: "Ensalada murciana", category: "primero", ingredients: ["Tomates enteros de bote", "Huevos", "Aceitunas negras", "Cebolla dulce", "Atún"], instructions: "" },
  { name: "Ensalada caprese", category: "primero", ingredients: ["Mozzarella", "Tomates de ensalada (RAF)"], instructions: "" },
  { name: "Ensalada de rúcula", category: "primero", ingredients: ["Rúcula", "Queso curado", "Tomatitos cherry"], instructions: "" },
  { name: "Ensalada gourmet", category: "primero", ingredients: ["Ensalada gourmet", "Queso curado o azul", "Anacardos o nueces", "Arándanos", "Bayas de Goji", "Aguacates"], instructions: "" },
  { name: "Ensalada de espinacas", category: "primero", ingredients: ["Espinacas", "Queso de cabra", "Salmón ahumado", "Anacardos", "Pasas", "Cebolla confitada"], instructions: "" },
  { name: "Ensaladilla rusa", category: "primero", ingredients: ["Bolsa ensaladilla", "Aceitunas", "Atún", "Huevo duro", "Aceite rojo", "Limón"], instructions: "" },
  { name: "Ensalada de verano", category: "primero", ingredients: ["Tomate de ensalada", "Atún", "Aceitunas verdes", "Huevo", "Cebolla dulce", "Palmitos"], instructions: "" },
  { name: "Cogollos con anchoas", category: "primero", ingredients: ["Cogollos", "Anchoas"], instructions: "" },
  { name: "Brócoli con mayonesa", category: "primero", ingredients: ["Brócoli", "Aceite del rojo", "Limón", "1 huevo"], instructions: "" },
  { name: "Berenjenas con mozzarella", category: "primero", ingredients: ["Berenjenas", "Mozzarella", "Tomates"], instructions: "" },
  { name: "Pulpo a la gallega", category: "segundo", ingredients: ["Pulpo", "Patatas", "Pimentón"], instructions: "" },
  { name: "Salmón", category: "segundo", ingredients: ["Salmón", "Sal gorda"], instructions: "" },
  { name: "Rape", category: "segundo", ingredients: ["Rape"], instructions: "" },
  { name: "Revuelto de ajetes y gambas", category: "segundo", ingredients: ["Ajetes", "Gambas", "Huevos"], instructions: "" },
  { name: "Salchichas al vino", category: "segundo", ingredients: ["Salchichas de pollo", "Vino blanco", "Cebolla", "1 hoja de laurel", "Limón"], instructions: "" },
  { name: "Solomillo al roquefort", category: "segundo", ingredients: ["Solomillos", "Queso azul", "Nata", "Vino blanco"], instructions: "" },
  { name: "Setas a la plancha", category: "segundo", ingredients: ["Setas", "Taquitos jamón serrano"], instructions: "" },
  { name: "Verduras a la plancha", category: "segundo", ingredients: ["Pimiento rojo", "Cebolla dulce", "Calabacín", "Berenjena", "Setas"], instructions: "" },
  { name: "Verdura Gonzalo", category: "segundo", ingredients: ["Zanahorias", "Puerro", "Judías", "Patata", "Calabacín", "Pollo", "Ternera"], instructions: "" },
  { name: "Merluza al horno con ajos", category: "segundo", ingredients: ["Merluza abierta sin espinas", "Ajos", "Limón"], instructions: "" },
  { name: "Merluza frita rebozada", category: "segundo", ingredients: ["Merluza en rodajas"], instructions: "" },
  { name: "Pollo de la abuela", category: "segundo", ingredients: ["Muslos de pollo", "Tacos de jamón Serrano", "Vino blanco", "Limón", "1 cabeza de ajos"], instructions: "" },
  { name: "Pollo asado", category: "segundo", ingredients: ["Muslos de pollo"], instructions: "" },
  { name: "Pechugas de pollo empanadas", category: "segundo", ingredients: ["Pechugas de pollo", "Pan rallado", "Huevos"], instructions: "" },
  { name: "Pechugas de pollo a la mostaza", category: "segundo", ingredients: ["Pechugas de pollo", "Mostaza en grano", "Cebolla frita", "Nata líquida"], instructions: "" },
  { name: "Pechugas villaroy", category: "segundo", ingredients: ["Pechugas de pollo", "Harina", "Pan rallado", "Leche"], instructions: "" },
  { name: "Dorada o lubina a la sal", category: "segundo", ingredients: ["Doradas o lubinas 3", "Sal gorda"], instructions: "" },
  { name: "Filetes de ternera a la plancha", category: "segundo", ingredients: ["Filetes de ternera"], instructions: "" },
  { name: "Carne guisada", category: "segundo", ingredients: ["Ternera", "Zanahorias", "Champiñones"], instructions: "" },
  { name: "Magra con tomate", category: "segundo", ingredients: ["Tomates", "Magro de cerdo", "Cebolla", "Pimiento verde"], instructions: "" },
  { name: "Bacalao con tomate", category: "segundo", ingredients: ["Bacalao", "Tomate", "Cebolla", "Pimiento verde"], instructions: "" },
  { name: "Gallos", category: "segundo", ingredients: ["Gallos", "Mantequilla", "Limón"], instructions: "" },
  { name: "Calamares fritos", category: "segundo", ingredients: ["Calamares"], instructions: "" },
  { name: "Boquerones fritos", category: "segundo", ingredients: ["Boquerones", "Harina", "Aceite"], instructions: "" },
  { name: "Pimientos del padrón", category: "segundo", ingredients: ["Pimientos del padrón"], instructions: "" },
  { name: "Alcachofas", category: "segundo", ingredients: ["Alcachofas"], instructions: "" },
  { name: "Judías verdes con jamón", category: "segundo", ingredients: ["Judías verdes", "Cebolla", "Tacos de jamón Serrano"], instructions: "" },
  { name: "Habas con jamón", category: "segundo", ingredients: ["Habas congeladas", "Tacos de jamón Serrano", "Cebolla frita"], instructions: "" },
  { name: "Guisantes con jamón", category: "segundo", ingredients: ["Guisantes", "Jamón Serrano en tacos", "Cebolla"], instructions: "" },
  { name: "Lomo con queso", category: "segundo", ingredients: ["Cinta de lomo", "Vino blanco", "Queso havarti lonchas", "Champiñones", "Mantequilla", "Maizena"], instructions: "" },
  { name: "Cinta de lomo", category: "segundo", ingredients: ["Lomo en filetes"], instructions: "" },
  { name: "Chuleta de Sajonia", category: "segundo", ingredients: ["Sajonia"], instructions: "" },
  { name: "Tortilla de patata", category: "segundo", ingredients: ["Huevos", "Patatas", "Cebolla", "Tomates"], instructions: "" },
  { name: "Albóndigas", category: "segundo", ingredients: ["Carne picada", "Pan bimbo", "Tomates", "Huevos", "Perejil"], instructions: "Mezclar todo y hornear 30 min." },
  { name: "Espaguetis", category: "otro", ingredients: ["Espaguetis", "Tomates", "Queso rallado de pasta"], instructions: "" },
  { name: "Arroz blanco con tomate y jamón York", category: "primero", ingredients: ["Arroz", "Jamón York", "Tomates", "Ajos"], instructions: "" },
  { name: "Arroz a la milanesa", category: "primero", ingredients: ["Arroz", "Champiñones", "Vino blanco", "Queso rallado fuerte tipo pasta"], instructions: "" },
  { name: "Pizza", category: "otro", ingredients: ["Harina", "Tomate", "Mozzarella", "Jamón York"], instructions: "" },
  { name: "Lasaña", category: "otro", ingredients: ["Maizena", "Harina", "Leche", "Carne picada", "Tomate", "Pasta lasaña"], instructions: "" },
  { name: "Croquetas", category: "otro", ingredients: ["Harina", "Pan rallado", "Jamón Serrano en tacos", "Leche entera", "Huevos"], instructions: "" },
  { name: "Huevos fritos con patatas", category: "otro", ingredients: ["Huevos", "Patatas", "Jamón serrano"], instructions: "" },
  { name: "Huevos revueltos con jamón y champiñones", category: "otro", ingredients: ["Huevos", "Jamón Serrano", "Champiñones"], instructions: "" },
  { name: "Huevos con bechamel", category: "otro", ingredients: ["Huevos", "Harina", "Leche", "Jamón"], instructions: "" },
  { name: "Pisto", category: "otro", ingredients: ["Tomate", "Pimiento verde", "Patata", "Cebolla", "Calabacín"], instructions: "" },
  { name: "Patatas de remoste", category: "primero", ingredients: ["Patatas", "Cebolla frita", "Chorizo"], instructions: "" },
  { name: "Lentejas", category: "otro", ingredients: ["Lentejas", "Chorizo", "Cebolla", "Zanahorias", "Patatas"], instructions: "" },
  { name: "Tomate frito", category: "otro", ingredients: ["Tomates", "Cebolla", "Aceite de oliva"], instructions: "" },
  { name: "Sandwich", category: "primero", ingredients: ["Pan bimbo", "Jamón york", "Queso lonchas", "Nata"], instructions: "" },
  { name: "Jamoncitos", category: "otro", ingredients: ["Jamón cortado 1 dedo de gordo", "Harina", "Huevo", "Pan rallado"], instructions: "" },
  { name: "Calabacín con tomate arcoiris", category: "primero", ingredients: ["Calabacín", "Tomates", "Nata", "Queso rallado", "Queso gouda o havarti"], instructions: "" },
  { name: "Atún con tomate", category: "segundo", ingredients: ["Atún", "Tomate", "Cebolla"], instructions: "" },
  { name: "Mousse de chocolate", category: "otro", ingredients: ["Chocolate negro", "Mantequilla", "Huevos", "Chocolate blanco"], instructions: "" },
  { name: "Bizcocho", category: "otro", ingredients: ["Huevos", "Limón", "Harina", "Azúcar", "Royal", "Aceite rojo"], instructions: "" },
];

export async function seedIfEmpty() {
  try {
    const existing = await db.select({ id: recipesTable.id }).from(recipesTable).limit(1);
    if (existing.length > 0) {
      logger.info("Database already has recipes, skipping seed");
      return;
    }
    logger.info("Seeding database with recipes...");
    await db.insert(recipesTable).values(RECIPES);
    logger.info({ count: RECIPES.length }, "Seed complete");
  } catch (err) {
    logger.error({ err }, "Failed to seed recipes");
  }
}
