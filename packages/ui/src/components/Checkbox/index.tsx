import React from 'react';
import { cn } from '../../lib/cn';
import { isReactNative } from '../../lib/platform';

export interface CheckboxProps {
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onValueChange?: (checked: boolean) => void;
  disabled?: boolean;
  required?: boolean;
  name?: string;
  value?: string;
  id?: string;
  className?: string;
  style?: any;
}

// React Native Checkbox implementation
const CheckboxRN: React.FC<CheckboxProps> = ({ 
  checked = false,
  defaultChecked,
  onCheckedChange,
  onValueChange,
  disabled = false,
  className,
  style,
  ...props 
}) => {
  const { View, TouchableOpacity } = require('react-native');
  const [isChecked, setIsChecked] = React.useState(checked || defaultChecked || false);
  
  React.useEffect(() => {
    if (checked !== undefined) {
      setIsChecked(checked);
    }
  }, [checked]);
  
  const handlePress = () => {
    if (disabled) return;
    
    const newValue = !isChecked;
    setIsChecked(newValue);
    
    if (onCheckedChange) {
      onCheckedChange(newValue);
    }
    if (onValueChange) {
      onValueChange(newValue);
    }
  };
  
  return (
    <TouchableOpacity
      onPress={handlePress}
      disabled={disabled}
      style={style}
      className={cn(
        'h-4 w-4 rounded border',
        isChecked 
          ? 'bg-primary-600 border-primary-600' 
          : 'bg-white dark:bg-neutral-950 border-neutral-300 dark:border-neutral-700',
        disabled && 'opacity-50',
        className
      )}
      {...props}
    >
      {isChecked && (
        <View className="flex-1 items-center justify-center">
          <View className="h-2 w-2 bg-white rounded-sm" />
        </View>
      )}
    </TouchableOpacity>
  );
};

// Web Checkbox implementation
const CheckboxWeb = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ 
    checked,
    defaultChecked,
    onCheckedChange,
    onChange,
    onValueChange,
    disabled = false,
    className,
    ...props 
  }, ref) => {
    const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      const isChecked = event.target.checked;
      
      if (onChange) {
        onChange(event);
      }
      if (onCheckedChange) {
        onCheckedChange(isChecked);
      }
      if (onValueChange) {
        onValueChange(isChecked);
      }
    };
    
    return (
      <div className="relative inline-flex items-center">
        <input
          type="checkbox"
          ref={ref}
          checked={checked}
          defaultChecked={defaultChecked}
          onChange={handleChange}
          disabled={disabled}
          className={cn(
            'peer h-4 w-4 shrink-0 rounded-sm border border-neutral-300 dark:border-neutral-700',
            'checked:bg-primary-600 checked:border-primary-600',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2',
            'disabled:cursor-not-allowed disabled:opacity-50',
            'dark:focus-visible:ring-offset-neutral-950',
            className
          )}
          {...props}
        />
        <svg
          className="pointer-events-none absolute left-0 h-4 w-4 text-white opacity-0 peer-checked:opacity-100"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>
    );
  }
);

CheckboxWeb.displayName = 'Checkbox';

export const Checkbox = isReactNative() ? CheckboxRN : CheckboxWeb;