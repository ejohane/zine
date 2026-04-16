import type { ReactElement, ReactNode } from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

interface RenderRouteOptions {
  route?: string;
  path?: string;
  redirects?: Array<{ path: string; element: ReactNode }>;
}

export function renderRoute(
  element: ReactElement,
  { route = '/', path = '/', redirects = [] }: RenderRouteOptions = {}
) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path={path} element={element} />
        {redirects.map((redirect) => (
          <Route key={redirect.path} path={redirect.path} element={redirect.element} />
        ))}
      </Routes>
    </MemoryRouter>
  );
}
