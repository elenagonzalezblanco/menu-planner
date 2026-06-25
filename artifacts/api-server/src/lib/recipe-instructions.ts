import { GENERATED_INSTRUCTIONS } from "./recipe-instructions-generated";

/**
 * Canonical preparation instructions for recipes, extracted from the user's
 * own recipe PDFs. Keyed by the recipe `name` exactly as stored in the DB.
 *
 * Used by the startup backfill to populate `recipes.instructions` for recipes
 * that don't have instructions yet (see `backfillInstructions`).
 *
 * `PDF_INSTRUCTIONS` are transcribed from the original recipe PDFs;
 * `GENERATED_INSTRUCTIONS` are AI-generated and approved by the user. Both are
 * merged into `RECIPE_INSTRUCTIONS`.
 */
const PDF_INSTRUCTIONS: Record<string, string> = {
  "Albóndigas":
    "1. Coloca la carne picada en un bol grande.\n" +
    "2. En el vaso de una batidora pon los huevos, la leche, el vino blanco, los ajos picados, el pan rallado, sal, pimienta y perejil fresco picado. Bate hasta integrar.\n" +
    "3. Vierte la mezcla sobre la carne y amasa bien. Rectifica de sal.\n" +
    "4. Forma bolas iguales y pásalas por harina, sacudiendo el exceso.\n" +
    "5. Fríelas por tandas en abundante aceite caliente hasta dorarlas.\n" +
    "6. Sírvelas solas o con salsa de tomate.",

  "Bacalao con tomate":
    "1. Enharina los trozos de bacalao desalado.\n" +
    "2. Fríelos a fuego fuerte en aceite caliente, 2 minutos por cada lado. Reserva.\n" +
    "3. Pica la cebolla y los pimientos verdes y póchalos unos 10 minutos en una cazuela amplia con un poco de aceite.\n" +
    "4. Añade el tomate frito, sal y pimienta y cocina unos minutos.\n" +
    "5. Incorpora el bacalao y deja cocinar todo junto 5 minutos más.",

  "Bizcocho":
    "Ingredientes: ralladura de 1-2 limones, 1 yogur natural, 1 medida de yogur de aceite, 2 de azúcar, 3 de harina, 1 sobre de levadura Royal, 4 huevos, 2 cucharadas de coco rallado y un chorrito de anís.\n" +
    "1. Bate los huevos con el azúcar.\n" +
    "2. Añade el yogur, el aceite, la ralladura de limón y el anís.\n" +
    "3. Incorpora la harina con la levadura tamizadas y el coco rallado.\n" +
    "4. Vierte en un molde engrasado y hornea a 180°C unos 35-40 minutos, hasta que al pinchar salga limpio.",

  "Sopa de calabacín":
    "1. Pela y trocea 200 g de patatas y 100 g de cebolla. Ponlas en una olla con 1 litro de agua y sal y hierve 10 minutos.\n" +
    "2. Añade 800 g de calabacín lavado y troceado y cocina 20 minutos más.\n" +
    "3. Escurre parte del agua, agrega 5 quesitos y un poco de caldo.\n" +
    "4. Tritura hasta obtener una crema fina. Rectifica de sal.",

  "Crema de zanahoria":
    "1. Pocha una cebolla (o un puerro) en juliana fina con aceite de oliva, a fuego medio, 5 minutos sin que tome color.\n" +
    "2. Añade 7 zanahorias en rodajas y rehoga un par de minutos.\n" +
    "3. Riega con 1 litro de caldo de verduras, salpimienta y lleva a ebullición. Cuece 15 minutos hasta que la zanahoria esté tierna.\n" +
    "4. Tritura, añade 150 ml de nata líquida, mezcla y sirve. Opcional: un poco de queso crema batido por encima.",

  "Ensalada murciana":
    "1. Cuece los huevos 10 minutos, deja enfriar y pélalos.\n" +
    "2. Corta la cebolleta en juliana y déjala en agua fría con sal 15 minutos; enjuaga bien.\n" +
    "3. Escurre los tomates de conserva sobre un colador y disponlos en una fuente, troceándolos y dejando algún trozo entero.\n" +
    "4. Añade los huevos en rodajas, el atún escurrido y desmigado, la cebolleta y las aceitunas negras.\n" +
    "5. Aliña con aceite de oliva virgen extra y sal. Mezcla y rectifica.",

  "Gallos":
    "1. Limpia los gallos, salpimienta y enharínalos, sacudiendo el exceso de harina.\n" +
    "2. Fríelos en aceite, dorándolos por cada lado, y colócalos en los platos.\n" +
    "3. En otra sartén derrite 100 g de mantequilla, añade el zumo de 2-3 limones y perejil picado y mezcla 2 minutos a fuego bajo.\n" +
    "4. Vierte la salsa sobre los gallos y calienta todo junto.",

  "Habas con jamón":
    "1. Cuece las habas 10 minutos en agua hirviendo con sal. Escurre y reserva.\n" +
    "2. Pocha la cebolla picada a fuego lento con aceite hasta que esté tierna. Añade el ajo picado y dóralo 1-2 minutos.\n" +
    "3. Incorpora el jamón en taquitos y rehoga. Agrega las habas y el vino blanco.\n" +
    "4. Deja reducir un par de minutos, añade un chorrito de agua, sal y pimienta y cocina 10 minutos más, hasta que queden tiernas y casi sin líquido.\n" +
    "5. Espolvorea menta picada y sirve con un hilo de aceite.",

  "Merluza al horno con ajos":
    "1. Precalienta el horno a 180°C.\n" +
    "2. Coloca los filetes de merluza en una bandeja de horno.\n" +
    "3. Exprime bastante zumo de limón por encima y añade un chorro de vino blanco.\n" +
    "4. Dora ajos picados en una sartén con aceite y vierte los ajos con su aceite sobre la merluza.\n" +
    "5. Salpimienta y hornea 15-20 minutos hasta que esté hecha. Sirve caliente.",

  "Pollo de la abuela":
    "1. Pela las cabezas de ajo (la primera piel) y dales un corte alrededor. Dóralas en medio dedo de aceite.\n" +
    "2. Añade el jamón en trozos y los muslos de pollo sin piel.\n" +
    "3. Incorpora el zumo de 2 limones, una pizca de tomillo, el vino blanco y sal.\n" +
    "4. Cuece a fuego lento unos 45 minutos hasta que el pollo esté tierno.\n" +
    "5. Si queda mucho caldo, sube el fuego al final para reducir.",

  "Croquetas":
    "1. Pica el jamón y la cebolla.\n" +
    "2. Dora la cebolla, aparta el aceite sobrante y añade el jamón.\n" +
    "3. Rehoga e incorpora la harina para que se integre.\n" +
    "4. Añade la leche templada poco a poco sin dejar de remover, junto con el perejil y la mantequilla.\n" +
    "5. Cocina a fuego lento removiendo, alrededor de 1 hora, hasta que la masa se despegue de la sartén.\n" +
    "6. Extiende la masa en una fuente y deja enfriar.\n" +
    "7. Da forma a las croquetas y rebózalas en huevo batido y pan rallado.\n" +
    "8. Fríelas en aceite caliente hasta que estén doradas.",

  "Salchichas al vino":
    "1. Pocha la cebolla en juliana y el ajo unos 10 minutos.\n" +
    "2. Pincha las salchichas y añádelas; cocina 10 minutos hasta que se doren.\n" +
    "3. Vierte el vino blanco y sube el fuego hasta que se evapore el alcohol.\n" +
    "4. Cubre con el caldo de pollo y cocina unos 20 minutos. Añade una hoja de laurel.\n" +
    "5. Rectifica de sal y sirve.",

  "Vichyssoise":
    "1. Limpia los puerros y usa solo la parte blanca, picada en rodajas. Pela y trocea las patatas.\n" +
    "2. Rehoga el puerro en 60 g de mantequilla a fuego muy lento, sin que tome color.\n" +
    "3. Cuando esté blando, añade las patatas y el caldo (o agua). Sube el fuego y cuece 30 minutos hasta que las patatas estén tiernas.\n" +
    "4. Tritura y, cuando se enfríe un poco, añade 200 ml de nata líquida. Salpimienta.\n" +
    "5. Sirve bien fría.",

  "Pechugas de pollo empanadas":
    "1. Salpimienta los filetes de pollo cortados finos.\n" +
    "2. Pásalos por huevo batido y luego por pan rallado en un plato amplio, presionando bien y sin echar pan por encima.\n" +
    "3. Calienta una capa fina de aceite que cubra el fondo de la sartén (unos 30 ml en una sartén de 24 cm).\n" +
    "4. Fríe los filetes a fuego medio-alto hasta que estén dorados por fuera y jugosos por dentro, dándoles la vuelta una vez (unos 2 minutos por lado).\n" +
    "5. Escúrrelos sobre papel de cocina y sirve.",

  "Lomo con queso":
    "1. Cuece una cinta de lomo con vino blanco y agua.\n" +
    "2. Con la salsa que sobra, añade una cucharadita de maizena y deja que espese.\n" +
    "3. Corta el lomo en rodajas, intercala queso entre ellas y mete al horno para gratinar.\n" +
    "4. Añade champiñones rehogados con mantequilla a la salsa.\n" +
    "5. Sirve con puré de patata para acompañar.",
};

export const RECIPE_INSTRUCTIONS: Record<string, string> = {
  ...PDF_INSTRUCTIONS,
  ...GENERATED_INSTRUCTIONS,
};

/**
 * Old placeholder values that were seeded before real instructions existed.
 * These should be overwritten by the backfill even though they're not empty.
 */
export const REPLACEABLE_PLACEHOLDERS = new Set<string>([
  "Mezclar todo y hornear 30 min.",
]);
