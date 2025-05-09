import { useBookmarks } from "@/bookmarks";
import { AddLinkFab } from "@/components/add-link-action-sheet";
import { SwipeableContentCard } from "@/components/content-list-card";
import { FlatList } from "@/components/ui/flat-list";
import { SafeAreaView } from "@/components/ui/safe-area-view";
import { Text } from "@/components/ui/text";

export default function Queue() {
  const {
    bookmarks: { isLoading, result },
    deleteBookmark,
  } = useBookmarks();

  if (isLoading) return <Text>Loading...</Text>;

  return (
    <SafeAreaView className="h-full bg-background-0">
      <FlatList
        className="h-full" 
        data={result ?? []} 
        renderItem={({ item }) => { 
          return ( 
            <SwipeableContentCard 
              bookmark={item}
              onDelete={() => deleteBookmark(item.id)} 
            /> 
          ); 
        }} 
      /> 
      <AddLinkFab />
    </SafeAreaView>
  );
}
