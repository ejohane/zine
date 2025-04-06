import React, { useState, useEffect } from 'react';
import { Box } from "@/components/ui/box";
import { Text } from "@/components/ui/text";
import { Pressable } from "@/components/ui/pressable";
import { Icon } from "@/components/ui/icon";
import { PlusIcon, XIcon } from "lucide-react-native";
import { Tag } from "@zine/core";
import * as Haptics from 'expo-haptics';
import { SheetManager } from "react-native-actions-sheet";

interface TagListProps {
  tags?: Tag[];
  onAddTag: (tagName: string) => void;
  onRemoveTag: (tagId: number) => void;
}

export function TagList({ tags = [], onAddTag, onRemoveTag }: TagListProps) {
  // Local state to manage tags
  const [localTags, setLocalTags] = useState<Tag[]>(tags);
  
  // Update local tags when props change
  useEffect(() => {
    setLocalTags(tags);
  }, [tags]);

  // Handle opening the tag sheet
  const handleOpenTagSheet = () => {
    SheetManager.show("add-tag", {
      payload: {
        onAddTag: (tagName: string) => {
          // Create a temporary tag with a temporary ID
          const newTag: Tag = {
            id: Date.now(), // Temporary ID
            name: tagName,
            createdAt: new Date()
          };
          
          // Update local state immediately
          setLocalTags(prevTags => [...prevTags, newTag]);
          
          // Call parent's onAddTag
          onAddTag(tagName);
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        }
      }
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  // Handle removing a tag
  const handleRemoveTag = (tagId: number) => {
    // Update local state immediately
    setLocalTags(prevTags => prevTags.filter(tag => tag.id !== tagId));
    
    // Call parent's onRemoveTag
    onRemoveTag(tagId);
  };

  return (
    <Box className="mb-4">
      <Text className="text-background-700 font-medium mb-2">Tags</Text>
      <Box className="flex-row flex-wrap gap-2">
        {localTags.map((tag) => (
          <Pressable
            key={tag.id}
            className="flex-row items-center bg-background-200 px-3 py-1 rounded-full"
            onPress={() => handleRemoveTag(tag.id)}
          >
            <Text className="text-background-700 mr-1">{tag.name}</Text>
            <Icon as={XIcon} size="xs" className="text-background-500" />
          </Pressable>
        ))}
        
        <Pressable
          className="flex-row items-center bg-background-300 px-3 py-1 rounded-full"
          onPress={handleOpenTagSheet}
        >
          <Icon as={PlusIcon} size="xs" className="text-background-500 mr-1" />
          <Text className="text-background-500">Add tag</Text>
        </Pressable>
      </Box>
    </Box>
  );
} 