import type { ReactNode } from 'react';

// Button Component Types
export interface ButtonProps {
  variant?: 'solid' | 'bordered' | 'light' | 'flat' | 'faded' | 'shadow' | 'ghost';
  color?: 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  radius?: 'none' | 'sm' | 'md' | 'lg' | 'full';
  isLoading?: boolean;
  isDisabled?: boolean;
  isIconOnly?: boolean;
  fullWidth?: boolean;
  startContent?: ReactNode;
  endContent?: ReactNode;
  spinner?: ReactNode;
  spinnerPlacement?: 'start' | 'end';
  onPress?: () => void;
  onClick?: () => void;
  children?: ReactNode;
  className?: string;
  'aria-label'?: string;
}

// Input/TextField Component Types
export interface InputProps {
  type?: 'text' | 'email' | 'password' | 'number' | 'tel' | 'url' | 'search';
  variant?: 'flat' | 'bordered' | 'faded' | 'underlined';
  color?: 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  radius?: 'none' | 'sm' | 'md' | 'lg' | 'full';
  label?: string;
  labelPlacement?: 'inside' | 'outside' | 'outside-left';
  placeholder?: string;
  description?: string;
  errorMessage?: string;
  value?: string;
  defaultValue?: string;
  isRequired?: boolean;
  isReadOnly?: boolean;
  isDisabled?: boolean;
  isInvalid?: boolean;
  isClearable?: boolean;
  startContent?: ReactNode;
  endContent?: ReactNode;
  onChange?: (value: string) => void;
  onValueChange?: (value: string) => void;
  onClear?: () => void;
  className?: string;
}

// Card Component Types
export interface CardProps {
  isBlurred?: boolean;
  isFooterBlurred?: boolean;
  isHoverable?: boolean;
  isPressable?: boolean;
  isDisabled?: boolean;
  disableAnimation?: boolean;
  disableRipple?: boolean;
  allowTextSelectionOnPress?: boolean;
  shadow?: 'none' | 'sm' | 'md' | 'lg';
  radius?: 'none' | 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  onPress?: () => void;
  onClick?: () => void;
  children?: ReactNode;
  className?: string;
}

export interface CardHeaderProps {
  children?: ReactNode;
  className?: string;
}

export interface CardBodyProps {
  children?: ReactNode;
  className?: string;
}

export interface CardFooterProps {
  isBlurred?: boolean;
  children?: ReactNode;
  className?: string;
}

// Badge Component Types
export interface BadgeProps {
  content?: ReactNode;
  color?: 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  variant?: 'solid' | 'flat' | 'faded' | 'shadow';
  shape?: 'circle' | 'rectangle';
  placement?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
  showOutline?: boolean;
  disableOutline?: boolean;
  disableAnimation?: boolean;
  isInvisible?: boolean;
  isOneChar?: boolean;
  isDot?: boolean;
  children?: ReactNode;
  className?: string;
  classNames?: {
    base?: string;
    badge?: string;
  };
}

// Avatar Component Types
export interface AvatarProps {
  src?: string;
  alt?: string;
  name?: string;
  icon?: ReactNode;
  color?: 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'danger';
  radius?: 'none' | 'sm' | 'md' | 'lg' | 'full';
  size?: 'sm' | 'md' | 'lg';
  isBordered?: boolean;
  isDisabled?: boolean;
  isFocusable?: boolean;
  showFallback?: boolean;
  fallback?: ReactNode;
  className?: string;
  classNames?: {
    base?: string;
    img?: string;
    fallback?: string;
    name?: string;
    icon?: string;
  };
}

// Spinner/Loading Component Types
export interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  color?: 'current' | 'white' | 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'danger';
  label?: string;
  labelColor?: 'foreground' | 'primary' | 'secondary' | 'success' | 'warning' | 'danger';
  className?: string;
  classNames?: {
    base?: string;
    wrapper?: string;
    circle1?: string;
    circle2?: string;
    label?: string;
  };
}

// Modal/Dialog Component Types
export interface ModalProps {
  isOpen?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
  onClose?: () => void;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl' | 'full';
  radius?: 'none' | 'sm' | 'md' | 'lg';
  shadow?: 'none' | 'sm' | 'md' | 'lg';
  backdrop?: 'transparent' | 'opaque' | 'blur';
  scrollBehavior?: 'inside' | 'outside';
  placement?: 'auto' | 'top' | 'center' | 'bottom';
  isDismissable?: boolean;
  isKeyboardDismissDisabled?: boolean;
  hideCloseButton?: boolean;
  closeButton?: ReactNode;
  motionProps?: any;
  portalContainer?: Element;
  children?: ReactNode;
  className?: string;
  classNames?: {
    wrapper?: string;
    base?: string;
    backdrop?: string;
    header?: string;
    body?: string;
    footer?: string;
    closeButton?: string;
  };
}

export interface ModalContentProps {
  children?: ReactNode;
  className?: string;
}

export interface ModalHeaderProps {
  children?: ReactNode;
  className?: string;
}

export interface ModalBodyProps {
  children?: ReactNode;
  className?: string;
}

export interface ModalFooterProps {
  children?: ReactNode;
  className?: string;
}

// Select/Dropdown Component Types
export interface SelectProps {
  label?: string;
  placeholder?: string;
  description?: string;
  errorMessage?: string;
  variant?: 'flat' | 'bordered' | 'faded' | 'underlined';
  color?: 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  radius?: 'none' | 'sm' | 'md' | 'lg' | 'full';
  labelPlacement?: 'inside' | 'outside' | 'outside-left';
  isRequired?: boolean;
  isDisabled?: boolean;
  isInvalid?: boolean;
  isLoading?: boolean;
  isMultiline?: boolean;
  selectionMode?: 'single' | 'multiple';
  selectedKeys?: Set<string> | 'all';
  defaultSelectedKeys?: Set<string> | 'all';
  disallowEmptySelection?: boolean;
  onSelectionChange?: (keys: Set<string>) => void;
  startContent?: ReactNode;
  endContent?: ReactNode;
  selectorIcon?: ReactNode;
  scrollRef?: React.RefObject<HTMLElement>;
  spinnerProps?: SpinnerProps;
  children?: ReactNode;
  className?: string;
  classNames?: {
    base?: string;
    label?: string;
    trigger?: string;
    mainWrapper?: string;
    innerWrapper?: string;
    selectorIcon?: string;
    spinner?: string;
    value?: string;
    listbox?: string;
    popoverContent?: string;
    helperWrapper?: string;
    description?: string;
    errorMessage?: string;
  };
}

export interface SelectItemProps {
  key: string;
  value?: string;
  textValue?: string;
  description?: string;
  startContent?: ReactNode;
  endContent?: ReactNode;
  selectedIcon?: ReactNode;
  isDisabled?: boolean;
  isReadOnly?: boolean;
  children?: ReactNode;
  className?: string;
  classNames?: {
    base?: string;
    wrapper?: string;
    title?: string;
    description?: string;
    selectedIcon?: string;
  };
}