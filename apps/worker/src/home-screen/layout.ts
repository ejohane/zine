import { and, asc, eq, inArray } from 'drizzle-orm';
import { ulid } from 'ulid';
import {
  HOME_SCREEN_COLLECTION_INSERT_AFTER,
  HOME_SCREEN_DEFAULT_BUILT_IN_SECTIONS,
  HomeCollectionLayout,
  HomeScreenBuiltInSectionSchema,
  HomeScreenSectionKind,
  getHomeScreenBuiltInSectionSubtitle,
  getHomeScreenBuiltInSectionTitle,
  type HomeScreenBuiltInSectionValue,
  type HomeScreenLayoutSection,
  type HomeScreenSettingsSectionInput,
} from '@zine/shared';
import type { Database } from '../db';
import { collections, homeCollectionSections, homeScreenSections } from '../db/schema';

export type HomeScreenEditableSection =
  | {
      kind: typeof HomeScreenSectionKind.BUILT_IN;
      builtInSection: HomeScreenBuiltInSectionValue;
      title: string;
      subtitle: string;
      enabled: boolean;
      position: number;
    }
  | {
      kind: typeof HomeScreenSectionKind.COLLECTION;
      collectionId: string;
      title: string;
      subtitle: string | null;
      enabled: true;
      position: number;
    };

export type AddableHomeCollection = {
  id: string;
  name: string;
  description: string | null;
};

type PersistedHomeScreenRow = {
  sectionType: string;
  builtInSection: string | null;
  collectionId: string | null;
  enabled: boolean;
  position: number;
};

type LegacyHomeCollectionRow = {
  collectionId: string;
  title: string;
  subtitle: string | null;
  position: number;
};

function buildDefaultLayout(
  legacyCollections: LegacyHomeCollectionRow[]
): HomeScreenLayoutSection[] {
  const sections: HomeScreenLayoutSection[] = [];

  for (const builtInSection of HOME_SCREEN_DEFAULT_BUILT_IN_SECTIONS) {
    sections.push({ kind: HomeScreenSectionKind.BUILT_IN, builtInSection });

    if (builtInSection === HOME_SCREEN_COLLECTION_INSERT_AFTER) {
      sections.push(
        ...legacyCollections.map(
          (collection): HomeScreenLayoutSection => ({
            kind: HomeScreenSectionKind.COLLECTION,
            collectionId: collection.collectionId,
          })
        )
      );
    }
  }

  return sections;
}

function parseBuiltInSection(value: string | null): HomeScreenBuiltInSectionValue | null {
  const parsed = HomeScreenBuiltInSectionSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function normalizePersistedLayout(rows: PersistedHomeScreenRow[]): HomeScreenLayoutSection[] {
  const sections: HomeScreenLayoutSection[] = [];
  const seenBuiltIns = new Set<HomeScreenBuiltInSectionValue>();

  for (const row of rows) {
    if (row.sectionType === HomeScreenSectionKind.BUILT_IN) {
      const builtInSection = parseBuiltInSection(row.builtInSection);
      if (!builtInSection || seenBuiltIns.has(builtInSection)) continue;
      seenBuiltIns.add(builtInSection);
      if (!row.enabled) continue;
      sections.push({ kind: HomeScreenSectionKind.BUILT_IN, builtInSection });
      continue;
    }

    if (row.sectionType === HomeScreenSectionKind.COLLECTION && row.collectionId) {
      sections.push({ kind: HomeScreenSectionKind.COLLECTION, collectionId: row.collectionId });
    }
  }

  for (const builtInSection of HOME_SCREEN_DEFAULT_BUILT_IN_SECTIONS) {
    if (!seenBuiltIns.has(builtInSection)) {
      sections.push({ kind: HomeScreenSectionKind.BUILT_IN, builtInSection });
    }
  }

  return sections;
}

export async function getHomeScreenLayoutSections(
  db: Database,
  userId: string
): Promise<HomeScreenLayoutSection[]> {
  const persistedRows = await db
    .select({
      sectionType: homeScreenSections.sectionType,
      builtInSection: homeScreenSections.builtInSection,
      collectionId: homeScreenSections.collectionId,
      enabled: homeScreenSections.enabled,
      position: homeScreenSections.position,
    })
    .from(homeScreenSections)
    .where(eq(homeScreenSections.userId, userId))
    .orderBy(asc(homeScreenSections.position), asc(homeScreenSections.createdAt));

  if (persistedRows.length > 0) {
    return normalizePersistedLayout(persistedRows);
  }

  const legacyCollections = await db
    .select({
      collectionId: collections.id,
      title: collections.name,
      subtitle: collections.description,
      position: homeCollectionSections.position,
    })
    .from(homeCollectionSections)
    .innerJoin(collections, eq(homeCollectionSections.collectionId, collections.id))
    .where(and(eq(homeCollectionSections.userId, userId), eq(collections.userId, userId)))
    .orderBy(asc(homeCollectionSections.position), asc(homeCollectionSections.createdAt));

  return buildDefaultLayout(legacyCollections);
}

export async function getHomeScreenSettings(db: Database, userId: string) {
  const [persistedRows, legacyCollections, userCollections] = await Promise.all([
    db
      .select({
        sectionType: homeScreenSections.sectionType,
        builtInSection: homeScreenSections.builtInSection,
        collectionId: homeScreenSections.collectionId,
        enabled: homeScreenSections.enabled,
        position: homeScreenSections.position,
      })
      .from(homeScreenSections)
      .where(eq(homeScreenSections.userId, userId))
      .orderBy(asc(homeScreenSections.position), asc(homeScreenSections.createdAt)),
    db
      .select({
        collectionId: collections.id,
        title: collections.name,
        subtitle: collections.description,
        position: homeCollectionSections.position,
      })
      .from(homeCollectionSections)
      .innerJoin(collections, eq(homeCollectionSections.collectionId, collections.id))
      .where(and(eq(homeCollectionSections.userId, userId), eq(collections.userId, userId)))
      .orderBy(asc(homeCollectionSections.position), asc(homeCollectionSections.createdAt)),
    db
      .select({
        id: collections.id,
        name: collections.name,
        description: collections.description,
      })
      .from(collections)
      .where(eq(collections.userId, userId))
      .orderBy(asc(collections.name), asc(collections.createdAt)),
  ]);

  const collectionById = new Map(
    userCollections.map((collection) => [collection.id, collection] as const)
  );
  const visibleSections: HomeScreenEditableSection[] = [];
  const hiddenBuiltInSections: HomeScreenEditableSection[] = [];
  const selectedCollectionIds = new Set<string>();

  if (persistedRows.length === 0) {
    let position = 1;
    for (const section of buildDefaultLayout(legacyCollections)) {
      if (section.kind === HomeScreenSectionKind.BUILT_IN) {
        visibleSections.push({
          kind: HomeScreenSectionKind.BUILT_IN,
          builtInSection: section.builtInSection,
          title: getHomeScreenBuiltInSectionTitle(section.builtInSection),
          subtitle: getHomeScreenBuiltInSectionSubtitle(section.builtInSection),
          enabled: true,
          position: position++,
        });
      } else {
        const collection = collectionById.get(section.collectionId);
        if (!collection) continue;
        selectedCollectionIds.add(collection.id);
        visibleSections.push({
          kind: HomeScreenSectionKind.COLLECTION,
          collectionId: collection.id,
          title: collection.name,
          subtitle: collection.description,
          enabled: true,
          position: position++,
        });
      }
    }
  } else {
    const seenBuiltIns = new Set<HomeScreenBuiltInSectionValue>();
    for (const row of persistedRows) {
      if (row.sectionType === HomeScreenSectionKind.BUILT_IN) {
        const builtInSection = parseBuiltInSection(row.builtInSection);
        if (!builtInSection || seenBuiltIns.has(builtInSection)) continue;
        seenBuiltIns.add(builtInSection);
        const section: HomeScreenEditableSection = {
          kind: HomeScreenSectionKind.BUILT_IN,
          builtInSection,
          title: getHomeScreenBuiltInSectionTitle(builtInSection),
          subtitle: getHomeScreenBuiltInSectionSubtitle(builtInSection),
          enabled: row.enabled,
          position: row.position,
        };
        if (row.enabled) {
          visibleSections.push(section);
        } else {
          hiddenBuiltInSections.push(section);
        }
        continue;
      }

      if (row.sectionType === HomeScreenSectionKind.COLLECTION && row.collectionId && row.enabled) {
        const collection = collectionById.get(row.collectionId);
        if (!collection) continue;
        selectedCollectionIds.add(collection.id);
        visibleSections.push({
          kind: HomeScreenSectionKind.COLLECTION,
          collectionId: collection.id,
          title: collection.name,
          subtitle: collection.description,
          enabled: true,
          position: row.position,
        });
      }
    }

    for (const builtInSection of HOME_SCREEN_DEFAULT_BUILT_IN_SECTIONS) {
      if (!seenBuiltIns.has(builtInSection)) {
        visibleSections.push({
          kind: HomeScreenSectionKind.BUILT_IN,
          builtInSection,
          title: getHomeScreenBuiltInSectionTitle(builtInSection),
          subtitle: getHomeScreenBuiltInSectionSubtitle(builtInSection),
          enabled: true,
          position: Number.MAX_SAFE_INTEGER,
        });
      }
    }
  }

  return {
    visibleSections: visibleSections.sort((a, b) => a.position - b.position),
    hiddenBuiltInSections: hiddenBuiltInSections.sort((a, b) => a.position - b.position),
    addableCollections: userCollections
      .filter((collection) => !selectedCollectionIds.has(collection.id))
      .map(
        (collection): AddableHomeCollection => ({
          id: collection.id,
          name: collection.name,
          description: collection.description,
        })
      ),
  };
}

export async function replaceHomeScreenSettings(
  db: Database,
  userId: string,
  inputSections: HomeScreenSettingsSectionInput[]
) {
  const now = Date.now();
  const collectionIds = inputSections
    .filter((section) => section.kind === HomeScreenSectionKind.COLLECTION)
    .map((section) => section.collectionId);
  const uniqueCollectionIds = [...new Set(collectionIds)];
  const ownedCollections =
    uniqueCollectionIds.length === 0
      ? []
      : await db
          .select({ id: collections.id })
          .from(collections)
          .where(and(eq(collections.userId, userId), inArray(collections.id, uniqueCollectionIds)));
  const ownedCollectionIds = new Set(ownedCollections.map((collection) => collection.id));

  if (ownedCollectionIds.size !== uniqueCollectionIds.length) {
    throw new Error('One or more collections are unavailable.');
  }

  const previousHomeCollections = await db
    .select({
      collectionId: homeCollectionSections.collectionId,
      layout: homeCollectionSections.layout,
    })
    .from(homeCollectionSections)
    .where(eq(homeCollectionSections.userId, userId));
  const previousLayoutByCollectionId = new Map(
    previousHomeCollections.map((section) => [section.collectionId, section.layout] as const)
  );

  await db.delete(homeScreenSections).where(eq(homeScreenSections.userId, userId));
  await db.delete(homeCollectionSections).where(eq(homeCollectionSections.userId, userId));

  const rows = inputSections.map((section, index) => ({
    id: ulid(),
    userId,
    sectionType: section.kind,
    builtInSection: section.kind === HomeScreenSectionKind.BUILT_IN ? section.builtInSection : null,
    collectionId: section.kind === HomeScreenSectionKind.COLLECTION ? section.collectionId : null,
    enabled: section.enabled,
    position: index + 1,
    createdAt: now,
    updatedAt: now,
  }));

  if (rows.length > 0) {
    await db.insert(homeScreenSections).values(rows);
  }

  const visibleCollections = inputSections.filter(
    (section) => section.kind === HomeScreenSectionKind.COLLECTION && section.enabled
  );

  if (visibleCollections.length > 0) {
    await db.insert(homeCollectionSections).values(
      visibleCollections.map((section, index) => ({
        id: ulid(),
        userId,
        collectionId: section.collectionId,
        position: index + 1,
        layout:
          previousLayoutByCollectionId.get(section.collectionId) ?? HomeCollectionLayout.STACK_RAIL,
        createdAt: now,
        updatedAt: now,
      }))
    );
  }
}

export async function resetHomeScreenSettings(db: Database, userId: string) {
  await db.delete(homeScreenSections).where(eq(homeScreenSections.userId, userId));
  await db.delete(homeCollectionSections).where(eq(homeCollectionSections.userId, userId));
}

export async function addCollectionToHomeScreenIfMissing(
  db: Database,
  userId: string,
  collectionId: string
) {
  const allRows = await db
    .select({ id: homeScreenSections.id })
    .from(homeScreenSections)
    .where(eq(homeScreenSections.userId, userId));

  if (allRows.length === 0) {
    const layout = await getHomeScreenLayoutSections(db, userId);
    const now = Date.now();
    await db.insert(homeScreenSections).values(
      layout.map((section, index) => ({
        id: ulid(),
        userId,
        sectionType: section.kind,
        builtInSection:
          section.kind === HomeScreenSectionKind.BUILT_IN ? section.builtInSection : null,
        collectionId:
          section.kind === HomeScreenSectionKind.COLLECTION ? section.collectionId : null,
        enabled: true,
        position: index + 1,
        createdAt: now,
        updatedAt: now,
      }))
    );
    return;
  }

  const existingRows = await db
    .select({ id: homeScreenSections.id })
    .from(homeScreenSections)
    .where(
      and(eq(homeScreenSections.userId, userId), eq(homeScreenSections.collectionId, collectionId))
    )
    .limit(1);

  if (existingRows[0]) return;

  const nextPositionRows = await db
    .select({
      nextPosition: homeScreenSections.position,
    })
    .from(homeScreenSections)
    .where(eq(homeScreenSections.userId, userId))
    .orderBy(asc(homeScreenSections.position));
  const position =
    nextPositionRows.length === 0
      ? HOME_SCREEN_DEFAULT_BUILT_IN_SECTIONS.length + 1
      : Math.max(...nextPositionRows.map((row) => row.nextPosition)) + 1;
  const now = Date.now();

  await db.insert(homeScreenSections).values({
    id: ulid(),
    userId,
    sectionType: HomeScreenSectionKind.COLLECTION,
    builtInSection: null,
    collectionId,
    enabled: true,
    position,
    createdAt: now,
    updatedAt: now,
  });
}

export async function removeCollectionFromHomeScreen(
  db: Database,
  userId: string,
  collectionId: string
) {
  await db
    .delete(homeScreenSections)
    .where(
      and(eq(homeScreenSections.userId, userId), eq(homeScreenSections.collectionId, collectionId))
    );
}
