import { describe, expect, it } from 'vitest';
import { LIBRARY_DRAWER_MEDIA, libraryPathIsCurrent } from '@/app/library/nav';
import {
  libraryJumpPages,
  likeContains,
  matchJumpPages,
  parseLibrarySearchQuery,
  tokenizeLibrarySearch,
} from '@/server/modules/library/search';

describe('library search parser', () => {
  it('keeps quoted phrases together', () => {
    expect(tokenizeLibrarySearch('737 "engine AMM" spare')).toEqual(['737', 'engine AMM', 'spare']);
  });

  it('lifts typed filters out of the leftover text', () => {
    expect(parseLibrarySearchQuery('type:manuals level:confidential 737 AMM')).toEqual({
      text: '737 AMM',
      documentType: 'manuals',
      classification: 'confidential',
    });
  });

  it('accepts the short aliases people will actually type', () => {
    expect(parseLibrarySearchQuery('category:cert class:restricted status:ARCHIVED')).toEqual({
      text: '',
      documentType: 'certificates',
      classification: 'restricted',
      status: 'ARCHIVED',
    });
    expect(parseLibrarySearchQuery('tag:amm part:CFM56-7B').tag).toBe('amm');
    expect(parseLibrarySearchQuery('tag:amm part:CFM56-7B').part).toBe('CFM56-7B');
  });

  it('leaves unknown operators in the text instead of swallowing them', () => {
    expect(parseLibrarySearchQuery('type:pdf invoice:12').text).toBe('type:pdf invoice:12');
  });

  it('escapes ILIKE wildcards so a percent in a title is not a wildcard', () => {
    expect(likeContains('50% leak_check\\x')).toBe('50\\% leak\\_check\\\\x');
  });
});

describe('library jump pages', () => {
  const pages = libraryJumpPages({
    mayUpload: true,
    mayCompany: true,
    mayUsers: true,
    mayAccess: true,
  });

  it('returns every page when the box is empty', () => {
    expect(matchJumpPages(pages, '').map((page) => page.href)).toContain('/library');
    expect(matchJumpPages(pages, '').length).toBe(pages.length);
  });

  it('matches on title and keywords, not a fuzzy party trick', () => {
    expect(matchJumpPages(pages, 'upload').map((page) => page.href)).toEqual([
      '/library/documents/new',
    ]);
    expect(matchJumpPages(pages, 'invite').map((page) => page.href)).toEqual([
      '/library/settings/users',
    ]);
    expect(matchJumpPages(pages, 'help').map((page) => page.href)).toEqual(['/library/help']);
    expect(matchJumpPages(pages, 'invoice')).toEqual([]);
  });

  it('hides privileged jumps when the caller cannot open them', () => {
    const viewer = libraryJumpPages({
      mayUpload: false,
      mayCompany: false,
      mayUsers: false,
      mayAccess: false,
    });
    expect(viewer.map((page) => page.href)).toEqual([
      '/library',
      '/library/help',
      '/library/documents',
      '/library/collections',
    ]);
  });
});

describe('libraryPathIsCurrent', () => {
  it('does not treat Upload as a document detail', () => {
    expect(libraryPathIsCurrent('/library/documents/new', '/library/documents', 'prefix')).toBe(
      false,
    );
    expect(libraryPathIsCurrent('/library/documents/abc', '/library/documents', 'prefix')).toBe(
      true,
    );
    expect(libraryPathIsCurrent('/library', '/library', 'exact')).toBe(true);
    expect(libraryPathIsCurrent('/library/documents', '/library', 'exact')).toBe(false);
    expect(libraryPathIsCurrent('/library/collections/abc', '/library/collections', 'prefix')).toBe(
      true,
    );
  });

  it('uses a drawer below typical laptop width so tablets get the menu button', () => {
    expect(LIBRARY_DRAWER_MEDIA).toBe('(max-width: 1100px)');
  });
});
