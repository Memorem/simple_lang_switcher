import type { Component, JSX } from 'solid-js';
import { splitProps } from 'solid-js';
import { Select as SelectPrimitive } from '@kobalte/core/select';
import { cn } from '~/lib/utils';

interface SelectProps<T> {
  class?: string;
  options: T[];
  value?: T;
  defaultValue?: T;
  onChange?: (value: T) => void;
  placeholder?: JSX.Element;
  itemComponent?: Component<{ item: { rawValue: T } }>;
  disabled?: boolean;
  required?: boolean;
  name?: string;
  multiple?: boolean;
  optionValue?: string;
  optionTextValue?: string;
  optionDisabled?: string;
}

function Select<T extends string>(props: SelectProps<T>) {
  const [local, others] = splitProps(props, ['class', 'placeholder', 'itemComponent']);

  return (
    <SelectPrimitive
      class={cn('relative', local.class)}
      itemComponent={
        local.itemComponent ??
        ((itemProps) => (
          <SelectPrimitive.Item
            item={itemProps.item}
            class={cn(
              'relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none',
              'focus:bg-accent focus:text-accent-foreground',
              'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
            )}
          >
            <span class="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
              <SelectPrimitive.ItemIndicator>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  class="h-4 w-4"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </SelectPrimitive.ItemIndicator>
            </span>
            <SelectPrimitive.ItemLabel>{String(itemProps.item.rawValue)}</SelectPrimitive.ItemLabel>
          </SelectPrimitive.Item>
        ))
      }
      {...others}
    >
      <SelectPrimitive.Trigger
        class={cn(
          'flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background',
          'placeholder:text-muted-foreground',
          'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
          'disabled:cursor-not-allowed disabled:opacity-50',
        )}
      >
        <SelectPrimitive.Value<string>>
          {(state) => state.selectedOption()}
        </SelectPrimitive.Value>
        <SelectPrimitive.Icon class="flex h-3.5 w-3.5 items-center justify-center opacity-50">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="h-4 w-4"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          class={cn(
            'relative z-50 min-w-[8rem] overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-md',
            'animate-in fade-in-0 zoom-in-95',
          )}
        >
          <SelectPrimitive.Listbox class="p-1" />
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive>
  );
}

export { Select };
