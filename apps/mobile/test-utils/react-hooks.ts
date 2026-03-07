import { createElement } from 'react';
import { act, create } from 'react-test-renderer';

type RenderHookResult<Result> = {
  result: { current: Result };
  rerender: (_nextProps?: unknown) => void;
  unmount: () => void;
};

export function renderHook<Result>(callback: () => Result): RenderHookResult<Result> {
  const result = { current: undefined as Result };

  function TestComponent() {
    result.current = callback();
    return null;
  }

  let renderer: ReturnType<typeof create> | null = null;

  act(() => {
    renderer = create(createElement(TestComponent));
  });

  const getRenderer = () => {
    if (!renderer) {
      throw new Error('Hook renderer not initialized');
    }

    return renderer;
  };

  return {
    result,
    rerender: () => {
      act(() => {
        getRenderer().update(createElement(TestComponent));
      });
    },
    unmount: () => {
      act(() => {
        getRenderer().unmount();
      });
    },
  };
}

export { act };
