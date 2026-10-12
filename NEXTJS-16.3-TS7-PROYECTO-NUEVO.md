---
title: "Next.js 16.3 + TypeScript 7 — implementación óptima en un proyecto nuevo"
description: "Qué activar, en qué orden, con qué skills y por qué. Arrancando de cero."
verificado_contra: "next@16.3.5 · react@19.3.0 · typescript@7.0.2 · node 24"
fecha: "2026-09-18"
---

# Next.js 16.3 + TypeScript 7 en un proyecto nuevo

Un proyecto nuevo tiene una ventaja que uno existente no tiene: podés activar
Cache Components desde el primer commit y escribir cada ruta sabiendo dónde va
el límite entre lo estático y lo dinámico. Migrar después cuesta mucho más.

## Fuentes

| Fuente | Qué aporta |
| --- | --- |
| `node_modules/next/dist/docs/` | Documentación de tu versión exacta. **Le gana a todo lo demás** |
| [Building App-like Experiences with Next.js 16.3](https://nextjs.org/blog/building-app-like-experiences-with-nextjs-16-3) | Los patrones completos, con apps demo reales |
| [Instant Navigation](https://nextjs.org/docs/app/guides/instant-navigation) | Validación, DevTools, tests E2E |
| [Announcing TypeScript 7.0](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/) | Performance, API ausente, breaking changes |

Las secciones **⚠ Medido** no salen de ninguna documentación: son errores reales,
con su texto exacto.

---

# Parte 1 — Arranque

```bash
npx create-next-app@latest mi-proyecto
```

Trae App Router, Turbopack y TypeScript. **Turbopack es el bundler por defecto**:
nada de `--turbo` ni `--turbopack` en los scripts.

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "typecheck": "tsc --noEmit"
  }
}
```

Un solo gestor y un solo lockfile. Webpack sólo con una incompatibilidad
demostrada: Turbopack acepta algunos loaders, pero **no acepta plugins de Webpack**.

---

# Parte 2 — TypeScript 7

## 2.1 Qué ganás

El compilador reescrito en Go. Números del anuncio oficial:

| Codebase | TS 6 | TS 7 | Mejora |
| --- | --- | --- | --- |
| vscode | 125.7 s | 10.6 s | **11.9×** |
| sentry | 139.8 s | 15.7 s | 8.9× |
| bluesky | 24.3 s | 2.8 s | 8.7× |
| playwright | 12.8 s | 1.47 s | 8.7× |
| tldraw | 11.2 s | 1.46 s | 7.7× |

Memoria: entre 6 % y 26 % menos. En el editor, la detección de errores en vscode
bajó de ~17.5 s a menos de 1.3 s.

Paralelización, nueva:

```bash
tsc --checkers 8      # workers de type-check (default: 4)
tsc --builders 4      # builders paralelos para project references
tsc --singleThreaded  # desactiva todo, para debug
```

Con `--checkers 8` las mejoras suben a ~16.7× en vscode.

## 2.2 Lo que TypeScript 7.0 **no** trae

**No publica API de JavaScript.** Verificalo en dos líneas:

```bash
node -e "const ts=require('typescript'); console.log(Object.keys(ts).length, typeof ts.createProgram)"
# 7.0.x -> 2 'undefined'
# 6.0.x -> cientos de keys, 'function'
```

Eso bloquea, hasta TypeScript **7.1**: `typescript-eslint`, loaders de webpack,
Volar, y las integraciones de Angular, Vue, MDX, Astro y Svelte.

## 2.3 Next.js 16.3 ya lo contempla

`next build` ejecuta el **binario `tsc` del proyecto** en vez de cargar la API.
Eso es exactamente lo que habilita TypeScript 7 hoy.

Fuente: `.../01-next-config-js/useTypeScriptCli.md`

```bash
npm install -D typescript@^7
```

**Nunca pongas `useTypeScriptCli: false` con TypeScript 7.** El build depende del
CLI justamente porque la API no existe.

## 2.4 ⚠ Breaking changes de `tsconfig.json`

Esto es lo más importante de TS 7 para un proyecto nuevo, y lo que menos se
menciona.

### Opciones eliminadas

| Ya no existe | Usá |
| --- | --- |
| `target: es5` | un target moderno |
| `downlevelIteration` | — |
| `moduleResolution: node` / `node10` | `nodenext` o `bundler` |
| `moduleResolution: classic` | `bundler` o `nodenext` |
| `module: amd \| umd \| systemjs \| none` | `esnext` + bundler |
| `baseUrl` | `paths` relativos a la raíz del proyecto |
| `esModuleInterop: false` | no se puede desactivar |
| `allowSyntheticDefaultImports: false` | no se puede desactivar |
| `alwaysStrict: false` | siempre `true` |
| `module X {}` en namespaces | `namespace X {}` |
| `import ... assert {}` | `import ... with {}` |

### Defaults nuevos

| Opción | Default en 7.0 | Por qué importa |
| --- | --- | --- |
| `strict` | **`true`** | Antes había que pedirlo |
| `module` | `esnext` | |
| `target` | ES estable actual | |
| `noUncheckedSideEffectImports` | **`true`** | Un import de efecto secundario a un módulo inexistente ahora es error |
| `stableTypeOrdering` | `true` | No se puede desactivar |
| `rootDir` | **`./`** | **Rompe layouts que no usan `src/`** |
| `types` | **`[]`** | **Ya no incluye automáticamente los `@types`** |

Los dos últimos son los que más muerden:

```jsonc
{
  "compilerOptions": {
    // Antes: todos los @types entraban solos. Ahora los declarás.
    "types": ["node"],
    // Si tu código no está en ./src, decilo explícito.
    "rootDir": "./src"
  }
}
```

Si tras instalar TS 7 aparecen errores de `process`, `Buffer` o `__dirname` sin
definir, es `types: []`. No es un bug.

### CLI

Con un `tsconfig.json` presente, `tsc` ya no acepta rutas de archivo sueltas.
Para eso está `--ignoreConfig`.

## 2.5 ¿Necesitás el setup lado a lado con TypeScript 6?

**Depende de una sola cosa: si alguna herramienta tuya importa `typescript` como
módulo.** No de tu gusto.

| Linter | ¿Importa la API? | ¿Alias? |
| --- | --- | --- |
| `typescript-eslint` | **Sí** | **Sí** |
| `oxlint` / `oxlint-tsgolint` (Rust) | No | No |
| `biome` (Rust) | No | No |
| `tsc --noEmit` | No | No |

Cómo saberlo con certeza, sin adivinar:

```bash
node -e "
const fs=require('fs'),p=require('path');
for(const d of fs.readdirSync('node_modules')){
  if(d.startsWith('.')) continue;
  const dirs = d.startsWith('@') ? fs.readdirSync(p.join('node_modules',d)).map(s=>p.join(d,s)) : [d];
  for(const m of dirs){
    try{
      const j=JSON.parse(fs.readFileSync(p.join('node_modules',m,'package.json'),'utf8'));
      const dep=j.dependencies?.typescript, peer=j.peerDependencies?.typescript;
      if(dep||peer) console.log(m.padEnd(34), 'dep:', dep||'-', '| peer:', peer||'-');
    }catch{}
  }
}
"
```

Clave para leerlo: un paquete que declara `typescript` como **dependency** se
lleva su copia anidada y no te afecta. El problema son los **peerDependency**,
que usan el `typescript` de la raíz.

### Si la respuesta es sí

```json
{
  "devDependencies": {
    "@typescript/native": "npm:typescript@^7.0.2",
    "typescript": "npm:@typescript/typescript6@^6.0.2"
  }
}
```

`typescript` resuelve a 6.0 (las herramientas siguen andando) y `npx tsc` corre
el 7.0. El paquete de compatibilidad expone además el binario `tsc6`.

### Si la respuesta es no

No lo instales. Dos paquetes y un alias para un problema que no tenés es
complejidad regalada.

## 2.6 Nightlies

`@typescript/native-preview` queda discontinuado. Las nightly vuelven al paquete
`typescript` con el tag `next`:

```bash
npm install -D typescript@next
```

Para producción, quedate en la estable.

## 2.7 Tipos que regala el framework

```tsx
export default function Page({ params }: PageProps<'/blog/[slug]'>) {}
```

Disponibles: `PageProps`, `LayoutProps`, `RouteContext`. Y rutas tipadas, donde
un `href` mal escrito pasa a ser error de tipos:

```ts
const nextConfig: NextConfig = { typedRoutes: true };
```

---

# Parte 3 — Los Skills

Vercel publica Skills oficiales que un agente de código ejecuta paso a paso.
Para un proyecto nuevo son la forma más rápida y segura de adoptar esto, porque
cada Skill trae el orden y las validaciones ya pensadas.

## 3.1 Los cinco que importan

```bash
# Base: bucle editar → verificar contra el dev server. Instalalo primero.
npx skills add vercel/next.js --skill next-dev-loop

# Migración a Cache Components
npx skills add vercel/next.js --skill next-cache-components-adoption

# Llevar una ruta concreta a navegación instantánea
npx skills add vercel/next.js --skill next-cache-components-optimizer

# Migración a Partial Prefetching
npx skills add vercel/next.js --skill next-partial-prefetching-adoption

# Animaciones de transición
npx skills add vercel-labs/agent-skills --skill vercel-react-view-transitions
```

| Skill | Qué hace |
| --- | --- |
| `next-dev-loop` | Verifica cada cambio contra un dev server corriendo, vía el MCP y el navegador. Es la base de los demás |
| `next-cache-components-adoption` | Migra la app a Cache Components, ruta por ruta |
| `next-cache-components-optimizer` | Toma una ruta y trabaja hasta que la UI que vos querés esté en pantalla al hacer clic. Escribe un test `instant()` que **falla antes** del arreglo y lo lleva a verde |
| `next-partial-prefetching-adoption` | Pasa la app a Partial Prefetching, donde los links comparten un App Shell |
| `vercel-react-view-transitions` | Agrega animaciones con `<ViewTransition>` |

Complemento que no es un Skill pero lo usan: [`agent-browser`](https://github.com/vercel-labs/agent-browser),
un CLI que expone DOM, consola, red y Web Vitals como texto estructurado. Con
React DevTools activo reporta el árbol de componentes y qué límites de Suspense
siguen pendientes — que es justo lo que un agente necesita para saber si su
cambio realmente entró.

## 3.2 Cómo usarlos

El orden importa: **Cache Components primero, Partial Prefetching después.**
Partial Prefetching sin Cache Components ni siquiera arranca.

Un punto que la documentación remarca y conviene respetar: **cada Skill deja
decisiones en tus manos** — cuánto entra en cada pull request, qué debe aparecer
instantáneo, qué puede llegar por streaming. Pedile al agente que te pregunte en
vez de decidir solo, y que no corra hacia un build que pasa.

Y el consejo más útil de todos, de la guía de Instant Navigation:

> Cuando una decisión de caché no está clara, dejá el dato fresco detrás de
> `<Suspense>` en vez de adivinar un tiempo de vida.

## 3.3 Las tres palancas

Un agente trabajando una ruta con Cache Components usa siempre las mismas tres:

| Palanca | Qué hace |
| --- | --- |
| **Push down** | Baja el I/O a un hijo envuelto en Suspense, para que el padre quede estático y los hermanos estáticos suban al shell |
| **Cache** | `'use cache'` + `cacheLife` para asignar un perfil de frescura |
| **Per-link prefetch** | Cuando la ruta lee `params` o `searchParams`, que se resuelvan en el prefetch del link |

Regla de verificación: **cada refactor va con una captura antes/después.** Si las
dos capturas se ven idénticas, el cambio no entró.

---

# Parte 4 — La configuración objetivo

En proyecto nuevo podés ir directo, porque no hay nada que migrar:

```ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  typedRoutes: true,
};

export default nextConfig;
```

`partialPrefetching` **requiere** `cacheComponents`; sin él, `next dev` y
`next build` fallan en la validación de config.

Lo que **no** va:

| Opción | Por qué |
| --- | --- |
| `experimental.ppr` | Eliminada. `cacheComponents` ya implementa PPR |
| `experimental.dynamicIO` / `useCache` | Reemplazadas por `cacheComponents` |
| `typescript.ignoreBuildErrors` | Esconde errores reales |
| `useTypeScriptCli: false` | Rompe el build con TS 7 |
| `reactCompiler` | Aparte y medido |

---

# Parte 5 — Cache Components

## 5.1 El modelo mental

**Los datos son dinámicos por defecto** y vos elegís qué cachear. Next
prerenderiza un shell estático que se sirve de inmediato; lo dinámico llega por
streaming.

| Clase | Qué es | Herramienta |
| --- | --- | --- |
| **Estático** | Código síncrono, UI determinista | nada, es el default |
| **Cacheado** | Datos reutilizables por un tiempo | `'use cache'` + `cacheLife` |
| **Dinámico** | Sesión, cookies, headers, tiempo real | `<Suspense>` |

Límites de Suspense **chicos**. No envuelvas la app entera: envolvé el componente
que depende del dato.

## 5.2 Las tres directivas

| Directiva | Dónde vive | Cuándo |
| --- | --- | --- |
| `'use cache'` | Memoria del servidor, compartida | Datos públicos reutilizables |
| `'use cache: private'` | **Sólo en el navegador**, no en el servidor | Funciones que leen `cookies()` o `headers()` |
| `'use cache: remote'` | Handler de caché de la plataforma | Datos de runtime que no entran en memoria; persiste entre instancias |

Las funciones y componentes con `use cache` **tienen que ser `async`**.

```ts
import { cacheLife, cacheTag } from 'next/cache';

async function getDrop(id: string) {
  'use cache';
  cacheLife('minutes');
  cacheTag('drops', `drop-${id}`);

  return db.drop.findUnique({ where: { id } });
}
```

Los argumentos serializables forman parte de la clave de caché.

**Dos detalles que cambian decisiones:**

- `'use cache: private'` **no puede formar parte del shell estático**. Para que
  el App Shell lo lleve antes del clic, su `stale` tiene que ser de al menos
  5 minutos.
- En despliegues serverless, `'use cache'` en memoria **no persiste entre
  instancias**. Ahí va `'use cache: remote'`.

## 5.3 La regla de oro con cookies y headers

Leé el dato dinámico **afuera** del scope cacheado y pasalo como argumento:

```tsx
import { cookies } from 'next/headers';
import { Suspense } from 'react';

export default function Page() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Dashboard />
    </Suspense>
  );
}

async function Dashboard() {
  const theme = (await cookies()).get('theme')?.value;
  return <DashboardView theme={theme} />;
}
```

**Nunca caches secretos ni tokens de sesión** sin evaluar aislamiento y
cardinalidad de la clave. Una clave mal elegida le sirve los datos de un usuario
a otro.

## 5.4 cacheLife

Perfiles incorporados: `default`, `seconds`, `minutes`, `hours`, `days`,
`weeks`, `max`. Podés definir los tuyos o pisar uno usando el mismo nombre.

```ts
const nextConfig: NextConfig = {
  cacheComponents: true,
  cacheLife: {
    catalog: {
      stale: 3600,      // cuánto cachea el cliente sin preguntar al servidor
      revalidate: 900,  // cada cuánto refresca el servidor
      expire: 86400,    // máximo stale antes de volverse dinámico
    },
  },
};
```

`expire` tiene que ser mayor que `revalidate`. No inventes duraciones: derivalas
de frecuencia de cambio, tolerancia a datos viejos, costo de consulta y
estrategia de invalidación.

## 5.5 El estado de UI ya no se reinicia solo

Con `cacheComponents`, Next usa `<Activity>` de React: al navegar, la ruta
anterior **no se desmonta**, pasa a modo `"hidden"`. El estado se conserva y al
volver atrás reaparece intacto. Los efectos se limpian al ocultarse y se
recrean al volver.

Auditá todo lo que dependía del desmontaje para resetearse: dropdowns, popovers,
modales, formularios, scroll, `useActionState`, efectos de inicialización.

Guía: `02-guides/preserving-ui-state.md`

---

# Parte 6 — Revalidar después de mutaciones

Cuando un control cambia datos del servidor, las vistas cacheadas que los
muestran tienen que seguirle el paso. El patrón oficial:

**Etiquetá la lectura con `cacheTag`, y expirá esa etiqueta con `updateTag`
desde la Server Action.**

```ts
'use server';

import { updateTag } from 'next/cache';

export async function toggleRepost(dropId: string) {
  const me = await verifyAuth();

  // ...escribir en la base...

  updateTag(`drop-${dropId}`);
  updateTag(`user-drops-${me}`);
  return { ok: true as const };
}
```

Las etiquetas a expirar dependen de **dónde aparece el dato que cambió**, no de
dónde se hizo el cambio. Un repost toca el post y también el perfil del usuario:
las dos se expiran.

| Función | Efecto | Dónde se puede llamar |
| --- | --- | --- |
| `updateTag(tag)` | Expira ya. El próximo request **espera** el dato fresco | **Sólo** Server Actions |
| `revalidateTag(tag, perfil)` | Refresca en segundo plano; puede servir stale mientras tanto | Server Actions y Route Handlers |
| `revalidatePath(path)` | Invalidación asociada a una ruta | ambos |

Regla: si el usuario acaba de hacer el cambio y **tiene que verlo**, `updateTag`.
Si puede tardar, `revalidateTag`.

Y el remate: con Partial Prefetching, un `<Link prefetch={true}>` visible puede
traer esa actualización **antes del clic**, así que el contenido fresco ya está
cuando navegás.

---

# Parte 7 — Instant Navigation

## 7.1 Qué significa "instantáneo"

Una navegación es instantánea cuando el navegador **puede empezar a renderizar
en el momento del clic**: contenido estático, cacheado y fallbacks aparecen ya,
mientras el servidor transmite el resto.

Un detalle que explica casi todos los casos raros: **una visita directa y una
navegación de cliente a la misma ruta producen UI inicial distinta.**

- **Visita directa** → recibe el shell estático como HTML, típicamente del CDN.
- **Navegación de cliente** → sólo re-renderiza **por debajo del layout
  compartido** entre origen y destino. Un `<Suspense>` que está por encima de ese
  punto **no sirve** en esa transición.

Por eso `useSearchParams()` suspende en carga de página (los params no se saben
en build) pero resuelve sincrónico en navegación de cliente: el router ya los
tiene de la URL.

## 7.2 Validación en desarrollo

Por defecto (`validationLevel: 'warning'`), toda app con Cache Components valida
**cada segmento Page y Default** en desarrollo, simulando tanto la carga directa
como las navegaciones de cliente en distintos puntos de la jerarquía.

Para validar sólo los segmentos que lo pidan explícitamente:

```ts
const nextConfig: NextConfig = {
  cacheComponents: true,
  experimental: {
    instantInsights: {
      validationLevel: 'manual-warning',
    },
  },
};
```

Cuando algo bloquea, el overlay nombra el componente culpable y ofrece tres
salidas — las mismas tres siempre:

| Salida | Cuándo |
| --- | --- |
| **Cache** | El contenido es reutilizable → `'use cache'` |
| **Stream** | Es dinámico y puede llegar después → `<Suspense>` |
| **Block** | Exclusión → `export const instant = false` |

**No conviertas datos en cacheables sólo para que se vaya un warning.** Si el
dato es por usuario y lo cacheás mal, el warning se va y el bug de privacidad se
queda.

## 7.3 Qué significa realmente `instant = false`

Esto se malinterpreta seguido. `instant = false` **saca al segmento del feedback
de validación**. No lo vuelve lento por decreto: puede seguir navegando
instantáneo si su estructura lo permite. Y las navegaciones **entre segmentos
hermanos por debajo se siguen validando**.

```tsx
export const instant = false;
```

Con `false` en `/dashboard/layout.tsx`, deja de marcar las navegaciones hacia
`/dashboard` desde afuera, pero sigue chequeando `/dashboard/a` → `/dashboard/b`.

Alternativa mejor que el opt-out, cuando el contenido depende de cookies o
headers pero tiene un tiempo de vida conocido: `'use cache: private'` con `stale`
de al menos 5 minutos. Así el App Shell lo lleva antes del clic.

## 7.4 Navigation Inspector

En las DevTools de Next, con Cache Components activo. Activá **Pause on
navigations** y el próximo clic o refresh **congela la página en su estado
inicial de carga**:

- En visita directa muestra **Loading shell · Page load** con la URL destino.
- En navegación de cliente, **Loading shell · Client nav** con origen y destino.

Combinalo con el panel de Suspense de React DevTools, que lista los límites y
te deja alternar cada uno entre fallback y resuelto.

Es la única forma honesta de ver **lo que ve tu usuario** antes de que llegue el
streaming.

## 7.5 Que valide no significa que esté bien

> Que la validación pase significa que la navegación es instantánea. No
> significa que los estados de carga sean buenos.

Un `<Suspense>` puesto bien arriba satisface la validación y reemplaza media
página con un solo esqueleto en cada navegación. Una página de producto que
mantiene header, imagen y descripción visibles, con sólo precio y stock detrás
del fallback, **se siente más rápida con el mismo tiempo total de carga**.

Bajá los límites todo lo que puedas.

---

# Parte 8 — Partial Prefetching

## 8.1 Qué cambia

Antes: una página con N links visibles generaba ~N prefetches.

Ahora: Next precarga **un App Shell reutilizable por ruta**, compartido por todos
los links que apuntan ahí. El contenido que depende de la URL (`params`,
`searchParams`) se resuelve después de navegar.

Las rutas que leen `cookies()` o `headers()` generan un shell que incluye datos
de sesión; el framework lo detecta y lo cachea **por sesión** en el cliente.

## 8.2 `prefetch={true}`

Opta al link a **per-link prefetching**: además del shell, resuelve `params`,
`searchParams` y la URL completa antes del clic, junto con el contenido cacheado
que dependa de eso.

```tsx
<Link href={`/track/${track.id}`} prefetch={true}>
  {track.title}
</Link>
```

Cuidado: **un link visible con `prefetch={true}` invoca al servidor al entrar en
viewport.** Usalo donde tener el contenido listo valga la request.

| Destino | Recomendación |
| --- | --- |
| Completamente estático | sin `prefetch={true}` |
| Datos ya cacheados | sin `prefetch={true}` |
| No cacheados pero reutilizables | cachealos y sacá el `prefetch` |
| Dependiente de `params`/`searchParams` | `prefetch={true}` |
| Tiempo real | sin prefetch; streaming post-navegación |
| Listas enormes de links | `prefetch={false}` o por intención |

**`prefetch={true}` no arregla una ruta que bloquea.** Primero hacé la ruta
instantánea con su App Shell; recién después optimizás el link.

## 8.3 Por ruta

Con el flag global apagado, una ruta puede adoptarlo sola:

```tsx
export const prefetch = 'partial';
```

---

# Parte 9 — Renderizado en vivo

Acá está lo que hace que una app se sienta app y no sitio.

## 9.1 Streaming: anidá los límites, no los pongas en paralelo

Si partís el contenido en límites hermanos, resuelven independientes y **se
empujan entre ellos** al aterrizar. Eso es CLS.

Anidándolos, el trabajo sigue corriendo en paralelo, pero el límite interno
espera a que el de arriba esté en su lugar. La página se asienta **de arriba
hacia abajo** sin retrasar nada:

```tsx
<Suspense fallback={<DropDetailSkeleton />}>
  <DropDetail id={id} />
  <Suspense fallback={<RepliesSkeleton />}>
    <Replies id={id} />
  </Suspense>
</Suspense>
```

## 9.2 Actualizaciones optimistas

`useTransition` sigue la Server Action y la actualización del servidor como **una
sola operación pendiente**. `useOptimistic` dentro de esa transición renderiza el
valor nuevo de inmediato. Si la Action falla, React vuelve solo al último valor
confirmado.

```tsx
'use client';

import { useOptimistic, useTransition } from 'react';

export function FavoriteButton({ trackId, isFavorite }) {
  const [, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(isFavorite);

  return (
    <button
      aria-pressed={optimistic}
      onClick={() => {
        startTransition(async () => {
          setOptimistic(!optimistic);
          await toggleFavorite(trackId);
        });
      }}
    >
      Favorite
    </button>
  );
}
```

Para **mutaciones repetidas que tienen que ir en orden** (arrastrar eventos de un
calendario, por ejemplo), `useActionState` las encola y `useOptimistic` mantiene
los cambios pendientes en pantalla.

## 9.3 Estado de cliente compartido entre rutas

Un provider en un **layout compartido** se mantiene montado mientras las rutas
cambian, y sus `children` pueden seguir siendo Server Components:

```tsx
export default function AppLayout({ children }) {
  return (
    <PlayerProvider>
      <main>{children}</main>
      <NowPlayingBar />
    </PlayerProvider>
  );
}
```

## 9.4 Caída de conexión (experimental)

Con retry offline, una navegación suave, un fetch de RSC, un prefetch o una
Server Action que falla **queda pendiente en vez de tirar error**, y reintenta
sola. El hook `useOffline()` te deja mostrar una barra de reconexión.

```ts
const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    useOffline: true,
  },
};
```

> **Experimental y sujeto a cambios. No recomendado para producción.**

## 9.5 Datos de cliente en vivo

Cuando necesitás polling, revalidación al enfocar o dedupe, empezá la request en
un Server Component y pasala al árbol de cliente. Así evitás la cascada:

```tsx
import { preload, SWRConfig } from 'swr';

export async function MessageThread({ channelId }) {
  const user = await getCurrentUser();
  const messageData = preload(messageKeys.channel(channelId), () =>
    getMessagesForUser(channelId, user.id),
  );

  return (
    <SWRConfig value={{ cacheData: { ...messageData } }}>
      <MessageList channelId={channelId} />
    </SWRConfig>
  );
}
```

El Client Component lee la misma clave y sigue desde ahí:

```ts
'use client';
import useSWR from 'swr';

export function useSuspenseMessages(channelId: string) {
  return useSWR(messageKeys.channel(channelId), fetchJson, {
    refreshInterval: 10_000,
    suspense: true,
  });
}
```

Con TanStack Query el equivalente es `HydrationBoundary` + `useSuspenseQuery`.

---

# Parte 10 — View Transitions

```bash
npx skills add vercel-labs/agent-skills --skill vercel-react-view-transitions
```

**No requiere configuración.** El App Router ya usa releases canary de React, que
incluyen `<ViewTransition>`. No instales `react@canary` a mano.

Las animaciones se activan con **Transitions, `<Suspense>` y `useDeferredValue`**.
Un `setState` común no las dispara. Como en Next las navegaciones son
transitions, se activan solas al navegar.

## 10.1 Revelados de Suspense

Un wrapper para que el contenido aparezca con fade cuando Suspense reemplaza el
esqueleto:

```tsx
import { ViewTransition, type ReactNode } from 'react';

export function Crossfade({ children }: { children: ReactNode }) {
  return (
    <ViewTransition enter="auto" default="none">
      {children}
    </ViewTransition>
  );
}
```

Envolviendo cada límite anidado por separado, animan independiente.

## 10.2 Morphs

Al sacar un elemento de una lista, los que quedan y lo que está debajo cambian de
posición. Envolviendo cada ítem con key, React los mueve en vez de dejar que
salten:

```tsx
{tracks.map((track, i) => (
  <ViewTransition key={track.id}>
    <TrackRow track={track} index={i} />
  </ViewTransition>
))}
```

Para un morph entre dos rutas (miniatura → detalle), usá el **mismo `name`** en
los dos lados:

```tsx
<ViewTransition name={`photo-${photo.id}`} share="morph" default="none">
```

> **Trampa documentada:** con `default="none"` y **sin** `share`, el par deja de
> hacer morph en silencio. Si ponés uno, poné el otro.

## 10.3 Transiciones de página con dirección

Los links declaran el tipo de transición:

```tsx
<Link href={prev} prefetch={true} transitionTypes={['nav-back']}>Anterior</Link>
<Link href={next} prefetch={true} transitionTypes={['nav-forward']}>Siguiente</Link>
```

Y el CSS anima los snapshots viejo y nuevo:

```css
@keyframes slide {
  from { translate: var(--slide-offset); }
}

::view-transition-old(.nav-forward) {
  --slide-offset: -60px;
  animation: 200ms ease-in-out both slide reverse;
}

::view-transition-new(.nav-forward) {
  --slide-offset: 60px;
  animation: 200ms ease-in-out both slide;
}
```

Guía completa: `02-guides/view-transitions.md`, incluyendo cómo **anclar
elementos persistentes** como headers y controles fijos para que no se animen.

---

# Parte 11 — Tests E2E que protegen lo instantáneo

La validación en desarrollo te dice que **existe** un shell. No te dice si tiene
el contenido correcto. Eso lo cierran los tests.

```bash
npm install -D @next/playwright @playwright/test
```

El helper `instant()` **acota las assertions a la UI disponible al instante**:
todo lo demás queda bloqueado hasta que el callback termina.

```ts
import { test, expect } from '@playwright/test';
import { instant } from '@next/playwright';

test('es instantáneo en carga directa', async ({ page, baseURL }) => {
  await instant(
    page,
    async () => {
      await page.goto('/store/hats');
      await expect(page.locator('h1')).toContainText('Baseball Cap');
      await expect(page.getByText('In stock')).toHaveCount(0); // todavía no
    },
    { baseURL },
  );
  await expect(page.getByText('In stock')).toBeVisible(); // ya sí
});

test('es instantáneo en navegación de cliente', async ({ page }) => {
  await page.goto('/store/shoes');
  await instant(page, async () => {
    await page.click('a[href="/store/hats"]');
    await page.waitForURL((url) => url.pathname === '/store/hats');
    await expect(page.locator('h1')).toContainText('Baseball Cap');
  });
});
```

Tres cosas para no tropezar:

1. Pasá `baseURL` cuando `page.goto()` es la primera navegación: el helper
   necesita el origen antes de pedir el documento.
2. En navegación de cliente, **esperá la URL destino antes de assertear** — si
   no, un selector compartido matchea la página de origen.
3. Corren contra `next dev` sin configuración. Para CI contra un build de
   producción:

```ts
const nextConfig: NextConfig = {
  cacheComponents: true,
  experimental: { exposeTestingApiInProductionBuild: true },
};
```

Escribí estos tests **para los flujos que más importan**, no para todos.

---

# Parte 12 — Turbopack, React Compiler, proxy

## 12.1 import.meta.glob

Turbopack soporta la API de Vite. **Sólo Turbopack, no Webpack.**

```js
const modules = import.meta.glob('./dir/*.js');
// { './dir/foo.js': () => import('./dir/foo.js'), ... }
```

Por defecto es **lazy**: cada valor es un thunk. Sirve para catálogos de MDX y
registros por convención. No migres imports que ya andan sólo porque existe.

## 12.2 Caché persistente de build

```ts
experimental: {
  turbopackFileSystemCacheForBuild: true,
  turbopackMemoryEviction: 'auto',  // ya es el default; no lo pongas si anda
}
```

Sólo si el build base funciona, tu CI conserva `.next` y comparaste frío contra
caliente. Build frío = borrar `.next`. **Registrá la mediana, no el mejor
resultado.**

## 12.3 React Compiler

```bash
npm install -D babel-plugin-react-compiler
```

```ts
const nextConfig: NextConfig = { reactCompiler: true };
```

Next usa una optimización propia en SWC para aplicarlo sólo a archivos con JSX o
hooks. Cuando está activo, dejá de escribir `useMemo` y `useCallback` a mano.

Si el dev server se pone lento: `reactCompiler: process.env.NODE_ENV === 'production'`.

## 12.4 Proxy

`middleware.ts` pasó a llamarse **`proxy.ts`**.

---

# Parte 13 — Integración con agentes

## 13.1 AGENTS.md

`next dev` escribe y re-agrega solo un bloque gestionado, entre
`<!-- BEGIN:nextjs-agent-rules -->` y `<!-- END:nextjs-agent-rules -->`.

1. **Tus reglas van afuera de los marcadores.** Lo de adentro se sobrescribe.
2. No lo traduzcas ni lo amplíes.
3. Commiteálo con tu trabajo. Borrarlo de un diff sólo lo vuelve a crear.

Para sincronizarlo sin escribirlo a mano — idéntico byte a byte a lo que produce
`next dev`, e idempotente:

```bash
node -e "const {writeAgentFiles}=require('next/dist/server/lib/generate-agent-files'); console.log(writeAgentFiles(process.cwd()))"
```

Con Claude Code, `CLAUDE.md` con una línea: `@AGENTS.md`

## 13.2 MCP de DevTools

```json
{
  "mcpServers": {
    "next-devtools": {
      "command": "npx",
      "args": ["-y", "next-devtools-mcp@latest"]
    }
  }
}
```

Con `next dev` corriendo, el agente consulta errores de compilación, runtime,
tipos, rutas, logs y diagnósticos de Instant Navigation.

**MCP no reemplaza lint, tipos, tests ni build.**

---

# Parte 14 — Trampas ⚠ Medido

Esto no está en ninguna documentación. Son errores reales, con su texto exacto.

## 14.1 `instant = false` NO perdona el reloj

La más cara. El opt-out saca al segmento de la **validación**; no habilita código
no determinista durante el prerender.

```
Error: Next.js encountered the unstable value `new Date()` while prerendering.
```

Sigue fallando con el opt-out puesto. Igual con `Math.random()`,
`crypto.randomUUID()` y `Date.now()`.

```tsx
// 1. Constante de módulo — si alcanza precisión de despliegue
const COPYRIGHT_YEAR = new Date().getFullYear();

// 2. Cacheada — si tiene que refrescarse sola
async function getYear() {
  'use cache';
  cacheLife('days');
  return new Date().getFullYear();
}

// 3. Por request — si de verdad tiene que ser exacto
import { connection } from 'next/server';
async function RequestId() {
  await connection();
  return <span>{crypto.randomUUID()}</span>;
}
```

Buscalo antes de escribir la primera ruta:

```bash
rg -n "new Date\(|Date\.now\(|Math\.random\(|randomUUID\(" src app
```

## 14.2 El sitemap se vuelve dinámico sin avisar

`lastModified: new Date()` dentro del `map()` de `sitemap.ts` convierte
`/sitemap.xml` de estático a dinámico **sin ningún error visible**. Sólo se ve en
la tabla de rutas del build, pasando de `○` a `ƒ`.

## 14.3 `dynamicParams` es incompatible

```
Error: Route segment config "dynamicParams" is not compatible with
`nextConfig.cacheComponents`. Please remove it.
```

Eliminalo. Si un parámetro no corresponde a datos reales, `notFound()`. Y
`generateStaticParams` no debe devolver un array vacío esperando diferir todo.

## 14.4 La autenticación es el caso difícil

Cualquier librería de auth que lea la sesión fuera de un `<Suspense>` bloquea
toda su capa:

```
Error: Next.js encountered uncached or runtime data during prerendering.
```

Es **por grupo de rutas**: poner el opt-out en una página hace que falle la
siguiente del mismo grupo. Diseñá la capa autenticada con sus límites de Suspense
desde el día uno. Guía dedicada:
`02-guides/authentication-with-cache-components.md`

## 14.5 Componentes async y tests de cliente

React **no puede renderizar componentes async en el cliente**. Si metés un
componente `async` con `'use cache'` dentro de uno compartido, cualquier test que
lo renderice en modo browser se rompe entero — y el error no menciona el
componente async.

Regla: los componentes compartidos que se testean se quedan **síncronos**. El
dato cacheado entra como **prop**, resuelto por el layout.

## 14.6 npm y los peers pinneados exactos

Familias como Vitest o Storybook pinnean sus peers a la versión exacta. npm no
las re-resuelve en el lugar:

```
npm error ERESOLVE could not resolve
```

**No lo resuelvas con `--force` ni `--legacy-peer-deps`**: te deja un árbol
incorrecto que falla más tarde y más lejos.

## 14.7 Playwright y las revisiones de Chromium

Un bump menor cambia la revisión de Chromium que exige:

```
Executable doesn't exist at ...chromium_headless_shell-1243...
```

El que manda es `playwright-core`, que puede entrar como transitiva de otro
paquete. O corrés `npx playwright install`, o lo fijás en `overrides`.

## 14.8 Windows y las comillas simples

`--run 'npm run db:migrate'` **no funciona en Windows**: cmd.exe no agrupa
comillas simples y los argumentos llegan partidos. Equipo mixto → comillas dobles
escapadas, o el comando en un `.mjs`.

---

# Parte 15 — Orden de implementación

1. `create-next-app`. Un solo gestor.
2. `typescript@^7`. **Revisá el tsconfig contra la tabla de 2.4** — `types: []` y
   `rootDir: './'` son los que rompen.
3. Verificá si necesitás el alias de TS 6 con el script de 2.5. Probablemente no.
4. `cacheComponents: true` desde el primer commit.
5. Instalá `next-dev-loop` y los Skills de adopción.
6. `AGENTS.md` + `.mcp.json`.
7. Escribí las rutas con los límites de Suspense ya puestos. **La auth primero**:
   define la forma del resto.
8. `partialPrefetching: true`. Auditá los `<Link>`.
9. Tests `instant()` en los flujos críticos.
10. `typedRoutes: true`.
11. View Transitions.
12. Recién ahora, de a uno y medidos: React Compiler, caché persistente de build.
13. Offline sólo si asumís que es experimental.

## Validación

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Después `next dev` y navegá: ruta principal, rutas dinámicas, back y forward,
formularios, modales, Server Actions, Route Handlers, metadata, autenticación,
cookies y headers, `params` y `searchParams`. Mirá consola del navegador, del
servidor, overlay e insights.

**Leé la tabla de rutas del build en cada cambio:**

```
○  (Static)             prerenderizado como HTML estático
◐  (Partial Prerender)  shell estático + contenido dinámico por streaming
ƒ  (Dynamic)            renderizado en el servidor por request
```

Una ruta que pasa de `○` a `ƒ` sin que vos lo hayas decidido es una regresión que
ningún test te va a marcar.

## Lo que nunca

- `typescript.ignoreBuildErrors`
- `useTypeScriptCli: false` con TypeScript 7
- Desactivar el linter para que pase el build
- Esconder errores de hidratación
- `'use client'` por las dudas
- Cambiar a Webpack sin incompatibilidad demostrada
- Cachear datos privados sin revisar clave y cardinalidad
- Activar flags experimentales sin una medición que los justifique

---

## Apps de referencia

Código abierto, sobre 16.3, con tests E2E usando `instant()`:

| App | Qué muestra |
| --- | --- |
| [Next Beats](https://github.com/vercel-labs/next-beats) | Reproductor. Playback que sobrevive a la navegación, optimistic, offline |
| [Drop](https://github.com/aurorascharff/next16-social-media) | Red social. Caché por ruta, `updateTag` tras mutación, crossfades |
| [Flow](https://github.com/aurorascharff/next16-calendar) | Calendario. Drag & drop, mutaciones en orden, transiciones direccionales |
| [Huddle](https://github.com/aurorascharff/next16-team-chat) | Chat de equipo. Variantes equivalentes con TanStack Query y SWR |

## Referencia rápida

```bash
rg -n "cacheComponents|use cache|partialPrefetching" node_modules/next/dist/docs
```

| Tema | `node_modules/next/dist/docs/01-app/` |
| --- | --- |
| Cache Components | `03-api-reference/05-config/01-next-config-js/cacheComponents.md` |
| Partial Prefetching | `03-api-reference/05-config/01-next-config-js/partialPrefetching.md` |
| `use cache` | `03-api-reference/01-directives/use-cache.md` |
| `use cache: private` | `03-api-reference/01-directives/use-cache-private.md` |
| `use cache: remote` | `03-api-reference/01-directives/use-cache-remote.md` |
| `cacheLife` | `03-api-reference/05-config/01-next-config-js/cacheLife.md` |
| `updateTag` | `03-api-reference/04-functions/updateTag.md` |
| `instant` | `03-api-reference/03-file-conventions/02-route-segment-config/instant.md` |
| `useOffline` | `03-api-reference/04-functions/use-offline.md` |
| TypeScript CLI | `03-api-reference/05-config/01-next-config-js/useTypeScriptCli.md` |
| Turbopack | `03-api-reference/08-turbopack.md` |
| Instant Navigation | `02-guides/instant-navigation.md` |
| View Transitions | `02-guides/view-transitions.md` |
| Streaming | `02-guides/streaming.md` |
| Apps interactivas | `02-guides/interactive-apps.md` |
| SPA | `02-guides/single-page-applications.md` |
| Datos en el cliente | `02-guides/client-side-data-fetching/` |
| Offline | `02-guides/offline-support.md` |
| Auth + Cache Components | `02-guides/authentication-with-cache-components.md` |
| Estado de UI preservado | `02-guides/preserving-ui-state.md` |
| Agentes de IA | `02-guides/ai-agents.md` |
| Proxy | `03-api-reference/03-file-conventions/proxy.md` |

La mejor configuración no es la que activa más flags. Es la que mantiene el
proyecto correcto, medible y mantenible.
