// Build-time contract check only. The iOS app has no API implementation imports.
import { readFileSync } from 'node:fs';
import { responseContract } from '../../api/src/openapi';
import { contributionSchema, fieldValueSchemas } from '../../api/src/enrichment';
const fixture = JSON.parse(
  readFileSync(new URL('../Resources/APIPreview.json', import.meta.url), 'utf8')
);
let checked = 0;
function validate(path: string, data: unknown) {
  const contract = responseContract(path === '/v1/items/search' ? 'post' : 'get', path, 200);
  if (!contract) throw new Error(`Missing response contract: ${path}`);
  contract.parse(data);
  checked++;
}
validate('/v1/items', fixture.itemList);
validate('/v1/collections', fixture.collectionList);
validate('/v1/sources', fixture.sourceList);
validate('/v1/subscriptions', fixture.subscriptionList);
for (const item of fixture.itemList.items) {
  validate('/v1/items/{itemId}', item);
  for (const [field, selected] of Object.entries(item.enrichment.fields) as [string, any][]) {
    const value = item.content[field];
    contributionSchema.parse({
      field,
      value,
      category: selected.category,
      provenance: selected.provenance,
    });
    fieldValueSchemas[field as keyof typeof fieldValueSchemas]?.parse(value);
  }
}
for (const detail of Object.values(fixture.details) as any[]) {
  validate('/v1/items/{itemId}/annotations', detail.annotations);
  validate('/v1/items/{itemId}/relationships', detail.relationships);
  validate('/v1/items/{itemId}/jobs', detail.jobs);
  if (detail.material) {
    validate(`/v1/items/{itemId}/${detail.material.field}`, detail.material);
    contributionSchema.parse({ ...detail.material, category: 'source' });
    fieldValueSchemas[detail.material.field as keyof typeof fieldValueSchemas]?.parse(
      detail.material.value
    );
  }
}
for (const search of fixture.searches) validate('/v1/items/search', search.response);
for (const collection of Object.values(fixture.orderedCollections))
  validate('/v1/collections/{collectionId}/items', collection);
console.log(
  `${checked} mock responses match current /v1 Zod contracts, including material and contribution validation.`
);
