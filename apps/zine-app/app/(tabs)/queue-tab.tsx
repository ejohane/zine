import { Text } from "@/components/ui/text";
import { useBookmarks } from "@/hooks/use-bookmarks";
import { FlatList } from "@/components/ui/flat-list";
import { ContentListCard } from "@/components/ui/content-list-card";
import { SafeAreaView } from "@/components/ui/safe-area-view";
import { AddLinkActionSheet } from "@/components/add-link-action-sheet";

export default function QueueTab() {
  const {
    bookmarks: { isLoading, result },
  } = useBookmarks();

  if (isLoading || !result) return <Text>Loading...</Text>;

  return (
    <SafeAreaView>
      <FlatList
        className="h-full"
        data={result}
        renderItem={({ item }) => {
          return (
            <ContentListCard
              url={item.content.url}
              title={item.content.title}
              image={item.content.image}
              author={item.content.author}
            />
          );
        }}
      />
      <AddLinkActionSheet />
    </SafeAreaView>
  );
}
