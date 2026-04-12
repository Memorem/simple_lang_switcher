import type { Component, ComponentProps } from 'solid-js';
import { splitProps } from 'solid-js';
import { Separator as SeparatorPrimitive } from '@kobalte/core/separator';
import { cn } from '~/lib/utils';

export interface SeparatorProps extends ComponentProps<typeof SeparatorPrimitive> {
  orientation?: 'horizontal' | 'vertical';
}

const Separator: Component<SeparatorProps> = (props) => {
  const [local, others] = splitProps(props, ['class', 'orientation']);

  return (
    <SeparatorPrimitive
      orientation={local.orientation ?? 'horizontal'}
      class={cn(
        'shrink-0 bg-border',
        (local.orientation ?? 'horizontal') === 'horizontal'
          ? 'h-[1px] w-full'
          : 'h-full w-[1px]',
        local.class,
      )}
      {...others}
    />
  );
};

export { Separator };
