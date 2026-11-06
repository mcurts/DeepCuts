// The app's pages and their URLs (React Router, data mode).
//
// Code splitting: the shell (AppLayout) is in the main bundle. Every page is `lazy`: its code is a
// separate file, fetched the first time someone opens that page. That keeps the first visit small
// (see `npm run analyze` and the bundle budget in scripts/check-bundle-size.mjs).
import { Navigate, type RouteObject } from 'react-router'
import { FEATURES, homeOf, type Features } from './config/features'
import { AppLayout } from './routes/AppLayout'
import { NotFound, RouteError } from './routes/PlaceholderPages'
import { RequireAccount } from './routes/RequireAccount'

// Each loader imports one page module and hands React Router its component.
const search = async () => ({ Component: (await import('./routes/search/SearchPage')).SearchPage })
// `/`: the landing page signed out, Home signed in.
const index = async () => ({ Component: (await import('./routes/IndexRoute')).IndexRoute })
const lists = async () => ({ Component: (await import('./routes/lists/ListsPage')).ListsPage })
const account = async () => ({
  Component: (await import('./routes/account/AccountPage')).AccountPage,
})
const signIn = async () => ({ Component: (await import('./routes/auth/SignInPage')).SignInPage })
const register = async () => ({
  Component: (await import('./routes/auth/RegisterPage')).RegisterPage,
})
const detail = async () => ({
  Component: (await import('./routes/movie-detail/MovieDetailPage')).MovieDetailPage,
})
const tune = async () => ({ Component: (await import('./routes/tune/TunePage')).TunePage })
// Labs: design and tuning tools for the owner, on the dev server only (FEATURES.labs). In a
// production build `import.meta.env.DEV` is false, so this list is empty and the labs' code is
// left out of the bundle altogether, not just unlinked.
const vhsLab = async () => ({ Component: (await import('./routes/lab/VhsLabPage')).VhsLabPage })
const weights = async () => ({
  Component: (await import('./routes/lab/WeightsPage')).WeightsPage,
})
const LAB_ROUTES: RouteObject[] = import.meta.env.DEV
  ? [
      { path: 'lab/vhs', lazy: vhsLab },
      { path: 'lab/weights', lazy: weights },
    ]
  : []

/**
 * Builds the route table. `/` is the landing page signed out and Home signed in. Every other page except Sign in and Register needs an account: it sits
 * under RequireAccount, which sends signed-out visitors to Sign in and back afterwards.
 * Onboarding (/tune) is optional and behind a feature flag; while a page's
 * flag is off, its URL redirects home. Tests pass their own `features` to check both states.
 */
export function createRoutes(features: Features = FEATURES): RouteObject[] {
  const homePath = homeOf().path
  return [
    // Pages inside the main shell: header with search and the account menu (AppLayout).
    {
      path: '/',
      element: <AppLayout />,
      errorElement: <RouteError />,
      children: [
        { index: true, lazy: index },
        // Bookmarked Discover links have one safe destination after Home.
        { path: 'discover', element: <Navigate to={homePath} replace /> },
        // The weights lab's old address, still in bookmarks: to the lab on the dev
        // server, to Home everywhere else.
        {
          path: 'discover/weights',
          element: <Navigate to={features.labs ? '/lab/weights' : homePath} replace />,
        },
        features.searchPage
          ? {
              path: 'search',
              element: <RequireAccount />,
              children: [{ index: true, lazy: search }],
            }
          : { path: 'search', element: <Navigate to={homePath} replace /> },
        {
          element: <RequireAccount />,
          children: [
            { path: 'lists', lazy: lists },
            { path: 'account', lazy: account },
            ...(features.labs ? LAB_ROUTES : []),
          ],
        },
        // Any unknown URL shows the "not found" page inside the shell.
        { path: '*', element: <NotFound /> },
      ],
    },
    // Sign-in has its own minimal layout: back, logo and the methods.
    { path: '/sign-in', lazy: signIn, errorElement: <RouteError /> },
    // Registration shares that layout (AuthLayout).
    { path: '/register', lazy: register, errorElement: <RouteError /> },
    // Detail has its own full-bleed layout (design v2). Signed in only.
    {
      element: <RequireAccount />,
      errorElement: <RouteError />,
      children: [{ path: '/movie/:id', lazy: detail }],
    },
    // Optional onboarding, also outside the tab-bar shell. Signed in only.
    features.onboarding
      ? {
          element: <RequireAccount />,
          errorElement: <RouteError />,
          children: [{ path: '/tune', lazy: tune }],
        }
      : {
          path: '/tune',
          element: <Navigate to={homePath} replace />,
          errorElement: <RouteError />,
        },
  ]
}

/** The routes with the real feature flags, used by the app (main.tsx). */
export const routes = createRoutes()
