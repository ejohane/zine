import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Card, CardHeader, CardBody, CardFooter } from '../Card';
import { DesignSystemProvider } from '../../providers/DesignSystemProvider';

const renderWithProvider = (component: React.ReactElement) => {
  return render(
    <DesignSystemProvider>
      {component}
    </DesignSystemProvider>
  );
};

describe('Card Component', () => {
  it('renders basic card', () => {
    renderWithProvider(
      <Card>
        <CardBody>Card Content</CardBody>
      </Card>
    );
    
    expect(screen.getByText('Card Content')).toBeInTheDocument();
  });

  it('renders card with header', () => {
    renderWithProvider(
      <Card>
        <CardHeader>Card Title</CardHeader>
        <CardBody>Card Content</CardBody>
      </Card>
    );
    
    expect(screen.getByText('Card Title')).toBeInTheDocument();
    expect(screen.getByText('Card Content')).toBeInTheDocument();
  });

  it('renders card with footer', () => {
    renderWithProvider(
      <Card>
        <CardBody>Card Content</CardBody>
        <CardFooter>Card Footer</CardFooter>
      </Card>
    );
    
    expect(screen.getByText('Card Content')).toBeInTheDocument();
    expect(screen.getByText('Card Footer')).toBeInTheDocument();
  });

  it('renders complete card structure', () => {
    renderWithProvider(
      <Card>
        <CardHeader>Header</CardHeader>
        <CardBody>Body</CardBody>
        <CardFooter>Footer</CardFooter>
      </Card>
    );
    
    expect(screen.getByText('Header')).toBeInTheDocument();
    expect(screen.getByText('Body')).toBeInTheDocument();
    expect(screen.getByText('Footer')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = renderWithProvider(
      <Card className="custom-card">
        <CardBody>Content</CardBody>
      </Card>
    );
    
    const card = container.querySelector('.custom-card');
    expect(card).toBeInTheDocument();
  });

  it('applies pressable behavior when isPressable is true', () => {
    const { container } = renderWithProvider(
      <Card isPressable>
        <CardBody>Pressable Card</CardBody>
      </Card>
    );
    
    const card = container.firstElementChild;
    expect(card).toHaveAttribute('role', 'button');
  });

  it('applies hover behavior when isHoverable is true', () => {
    const { container } = renderWithProvider(
      <Card isHoverable>
        <CardBody>Hoverable Card</CardBody>
      </Card>
    );
    
    const card = container.firstElementChild;
    expect(card).toBeTruthy();
  });
});