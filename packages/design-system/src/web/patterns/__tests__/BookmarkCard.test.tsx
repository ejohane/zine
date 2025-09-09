import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BookmarkCard } from '../../components/patterns/BookmarkCard';
import { DesignSystemProvider } from '../../providers/DesignSystemProvider';

const renderWithProvider = (component: React.ReactElement) => {
  return render(
    <DesignSystemProvider>
      {component}
    </DesignSystemProvider>
  );
};

const mockBookmark = {
  id: '1',
  title: 'Test Bookmark',
  description: 'This is a test bookmark',
  url: 'https://example.com',
  thumbnail: 'https://example.com/image.jpg',
  tags: ['test', 'bookmark'],
  platform: 'spotify' as const,
  createdAt: new Date('2024-01-01'),
};

describe('BookmarkCard Component', () => {
  it('renders bookmark information', () => {
    renderWithProvider(<BookmarkCard {...mockBookmark} />);
    
    expect(screen.getByText('Test Bookmark')).toBeInTheDocument();
    expect(screen.getByText('This is a test bookmark')).toBeInTheDocument();
  });

  it('displays platform badge', () => {
    renderWithProvider(<BookmarkCard {...mockBookmark} />);
    
    expect(screen.getByText('spotify')).toBeInTheDocument();
  });

  it('displays tags', () => {
    renderWithProvider(<BookmarkCard {...mockBookmark} />);
    
    expect(screen.getByText('test')).toBeInTheDocument();
    expect(screen.getByText('bookmark')).toBeInTheDocument();
  });

  it('renders thumbnail image', () => {
    renderWithProvider(<BookmarkCard {...mockBookmark} />);
    
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', 'https://example.com/image.jpg');
  });

  it('calls onView when view button is clicked', () => {
    const handleView = vi.fn();
    renderWithProvider(
      <BookmarkCard {...mockBookmark} onView={handleView} />
    );
    
    const viewButton = screen.getByText('View');
    fireEvent.click(viewButton);
    expect(handleView).toHaveBeenCalledWith(mockBookmark.id);
  });

  it('calls onEdit when edit button is clicked', () => {
    const handleEdit = vi.fn();
    renderWithProvider(
      <BookmarkCard {...mockBookmark} onEdit={handleEdit} />
    );
    
    const editButton = screen.getByText('Edit');
    fireEvent.click(editButton);
    expect(handleEdit).toHaveBeenCalledWith(mockBookmark.id);
  });

  it('calls onDelete when delete button is clicked', () => {
    const handleDelete = vi.fn();
    renderWithProvider(
      <BookmarkCard {...mockBookmark} onDelete={handleDelete} />
    );
    
    const deleteButton = screen.getByText('Delete');
    fireEvent.click(deleteButton);
    expect(handleDelete).toHaveBeenCalledWith(mockBookmark.id);
  });

  it('applies platform-specific color', () => {
    const spotifyBookmark = { ...mockBookmark, platform: 'spotify' as const };
    const { container } = renderWithProvider(
      <BookmarkCard {...spotifyBookmark} />
    );
    
    const badge = container.querySelector('[data-slot="badge"]');
    expect(badge).toBeTruthy();
  });

  it('handles YouTube platform', () => {
    const youtubeBookmark = { ...mockBookmark, platform: 'youtube' as const };
    renderWithProvider(<BookmarkCard {...youtubeBookmark} />);
    
    expect(screen.getByText('youtube')).toBeInTheDocument();
  });

  it('handles Apple platform', () => {
    const appleBookmark = { ...mockBookmark, platform: 'apple' as const };
    renderWithProvider(<BookmarkCard {...appleBookmark} />);
    
    expect(screen.getByText('apple')).toBeInTheDocument();
  });

  it('handles Google platform', () => {
    const googleBookmark = { ...mockBookmark, platform: 'google' as const };
    renderWithProvider(<BookmarkCard {...googleBookmark} />);
    
    expect(screen.getByText('google')).toBeInTheDocument();
  });

  it('handles Web platform', () => {
    const webBookmark = { ...mockBookmark, platform: 'web' as const };
    renderWithProvider(<BookmarkCard {...webBookmark} />);
    
    expect(screen.getByText('web')).toBeInTheDocument();
  });

  it('renders without thumbnail', () => {
    const bookmarkWithoutThumbnail = { ...mockBookmark, thumbnail: undefined };
    renderWithProvider(<BookmarkCard {...bookmarkWithoutThumbnail} />);
    
    expect(screen.getByText('Test Bookmark')).toBeInTheDocument();
  });

  it('renders without tags', () => {
    const bookmarkWithoutTags = { ...mockBookmark, tags: [] };
    renderWithProvider(<BookmarkCard {...bookmarkWithoutTags} />);
    
    expect(screen.getByText('Test Bookmark')).toBeInTheDocument();
  });
});