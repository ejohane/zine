import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from '../Button';
import { DesignSystemProvider } from '../../providers/DesignSystemProvider';

const renderWithProvider = (component: React.ReactElement) => {
  return render(
    <DesignSystemProvider>
      {component}
    </DesignSystemProvider>
  );
};

describe('Button Component', () => {
  it('renders with children', () => {
    renderWithProvider(<Button>Click me</Button>);
    expect(screen.getByText('Click me')).toBeInTheDocument();
  });

  it('handles click events', () => {
    const handleClick = vi.fn();
    renderWithProvider(<Button onPress={handleClick}>Click me</Button>);
    
    fireEvent.click(screen.getByText('Click me'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('applies variant styles', () => {
    const { container } = renderWithProvider(
      <Button variant="solid">Solid Button</Button>
    );
    const button = container.querySelector('button');
    expect(button).toBeTruthy();
  });

  it('applies color styles', () => {
    const { container } = renderWithProvider(
      <Button color="danger">Danger Button</Button>
    );
    const button = container.querySelector('button');
    expect(button).toHaveClass('bg-danger');
  });

  it('handles disabled state', () => {
    const handleClick = vi.fn();
    renderWithProvider(
      <Button isDisabled onPress={handleClick}>
        Disabled Button
      </Button>
    );
    
    const button = screen.getByText('Disabled Button').closest('button');
    expect(button).toBeDisabled();
    
    fireEvent.click(screen.getByText('Disabled Button'));
    expect(handleClick).not.toHaveBeenCalled();
  });

  it('shows loading state', () => {
    renderWithProvider(<Button isLoading>Loading Button</Button>);
    
    const button = screen.getByText('Loading Button').closest('button');
    expect(button?.querySelector('svg')).toBeInTheDocument(); // Loading spinner
  });

  it('renders with start content', () => {
    renderWithProvider(
      <Button startContent={<span data-testid="start-icon">★</span>}>
        Button with Icon
      </Button>
    );
    
    expect(screen.getByTestId('start-icon')).toBeInTheDocument();
  });

  it('renders with end content', () => {
    renderWithProvider(
      <Button endContent={<span data-testid="end-icon">→</span>}>
        Button with Icon
      </Button>
    );
    
    expect(screen.getByTestId('end-icon')).toBeInTheDocument();
  });

  it('applies size prop correctly', () => {
    const { container } = renderWithProvider(
      <Button size="lg">Large Button</Button>
    );
    
    const button = container.querySelector('button');
    expect(button).toHaveClass('h-12'); // Large size class
  });
});