// A publication-derived user_item is not proof of mailbox ownership (PR440).
// Only actual newsletter delivery provenance authorizes private Gmail metadata/body.
export const savedItemVisibilitySql = `(
  (i.provider='GMAIL' AND EXISTS (
    SELECT 1 FROM newsletter_feed_messages m JOIN newsletter_feeds f ON f.id=m.newsletter_feed_id
    JOIN gmail_mailboxes b ON b.id=m.gmail_mailbox_id AND b.id=f.gmail_mailbox_id
    WHERE m.item_id=i.id AND m.user_id=ui.user_id AND f.user_id=ui.user_id AND b.user_id=ui.user_id
  )) OR (i.provider IN ('WEB','RSS','SUBSTACK','YOUTUBE','SPOTIFY','X')
    AND NOT (CASE WHEN json_valid(i.raw_metadata) THEN
      COALESCE(json_extract(i.raw_metadata,'$.isPrivate'),0)=1 OR
      COALESCE(json_extract(i.raw_metadata,'$.private'),0)=1 OR
      COALESCE(json_extract(i.raw_metadata,'$.isPublic'),1)=0 OR
      COALESCE(json_extract(i.raw_metadata,'$.isPrivateFeed'),0)=1 OR
      COALESCE(json_extract(i.raw_metadata,'$.privateFeed'),0)=1 OR
      COALESCE(json_extract(i.raw_metadata,'$.visibility'),'')='private'
    ELSE i.raw_metadata IS NOT NULL END)
  )
)`;
