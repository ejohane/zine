#!/bin/bash

# Fix unused imports in Page.stories.tsx
sed -i '' '/Heart,/d' packages/design-system/src/components/silk/Page/Page.stories.tsx

# Fix unused imports in SheetWithDetent.stories.tsx
sed -i '' '/Settings,/d' packages/design-system/src/components/silk/SheetWithDetent/SheetWithDetent.stories.tsx
sed -i '' '/Pause,/d' packages/design-system/src/components/silk/SheetWithDetent/SheetWithDetent.stories.tsx

# Fix unused imports in SheetWithKeyboard.stories.tsx
sed -i '' "/'Badge'/d" packages/design-system/src/components/silk/SheetWithKeyboard/SheetWithKeyboard.stories.tsx
sed -i '' '/Mail,/d' packages/design-system/src/components/silk/SheetWithKeyboard/SheetWithKeyboard.stories.tsx
sed -i '' '/Phone,/d' packages/design-system/src/components/silk/SheetWithKeyboard/SheetWithKeyboard.stories.tsx
sed -i '' '/MapPin,/d' packages/design-system/src/components/silk/SheetWithKeyboard/SheetWithKeyboard.stories.tsx
sed -i '' '/Calendar,/d' packages/design-system/src/components/silk/SheetWithKeyboard/SheetWithKeyboard.stories.tsx
sed -i '' '/Clock,/d' packages/design-system/src/components/silk/SheetWithKeyboard/SheetWithKeyboard.stories.tsx
sed -i '' '/SortAsc/d' packages/design-system/src/components/silk/SheetWithKeyboard/SheetWithKeyboard.stories.tsx

# Fix unused imports in SheetWithStacking.stories.tsx
sed -i '' 's/, StackedSheet//g' packages/design-system/src/components/silk/SheetWithStacking/SheetWithStacking.stories.tsx
sed -i '' '/Settings,/d' packages/design-system/src/components/silk/SheetWithStacking/SheetWithStacking.stories.tsx
sed -i '' '/Info,/d' packages/design-system/src/components/silk/SheetWithStacking/SheetWithStacking.stories.tsx

# Fix unused imports in Sidebar.stories.tsx
sed -i '' '/Upload,/d' packages/design-system/src/components/silk/Sidebar/Sidebar.stories.tsx
sed -i '' '/Mail,/d' packages/design-system/src/components/silk/Sidebar/Sidebar.stories.tsx
sed -i '' '/Phone,/d' packages/design-system/src/components/silk/Sidebar/Sidebar.stories.tsx
sed -i '' '/HelpCircle,/d' packages/design-system/src/components/silk/Sidebar/Sidebar.stories.tsx
sed -i '' '/Filter,/d' packages/design-system/src/components/silk/Sidebar/Sidebar.stories.tsx
sed -i '' '/Server,/d' packages/design-system/src/components/silk/Sidebar/Sidebar.stories.tsx
sed -i '' '/MapPin,/d' packages/design-system/src/components/silk/Sidebar/Sidebar.stories.tsx

# Fix unused imports in TopSheet.stories.tsx
sed -i '' '/Filter,/d' packages/design-system/src/components/silk/TopSheet/TopSheet.stories.tsx
sed -i '' '/X,/d' packages/design-system/src/components/silk/TopSheet/TopSheet.stories.tsx
sed -i '' '/ChevronDown,/d' packages/design-system/src/components/silk/TopSheet/TopSheet.stories.tsx
sed -i '' '/Signal,/d' packages/design-system/src/components/silk/TopSheet/TopSheet.stories.tsx

echo "Fixed unused imports"
