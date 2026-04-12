import type { ComponentProps, ParentComponent } from 'solid-js';
import { splitProps } from 'solid-js';
import { cn } from '~/lib/utils';

const Card: ParentComponent<ComponentProps<'div'>> = (props) => {
  const [local, others] = splitProps(props, ['class']);

  return (
    <div
      class={cn(
        'rounded-lg border border-border bg-card text-card-foreground shadow-sm',
        local.class,
      )}
      {...others}
    />
  );
};

const CardHeader: ParentComponent<ComponentProps<'div'>> = (props) => {
  const [local, others] = splitProps(props, ['class']);

  return <div class={cn('flex flex-col space-y-1.5 p-6', local.class)} {...others} />;
};

const CardTitle: ParentComponent<ComponentProps<'h3'>> = (props) => {
  const [local, others] = splitProps(props, ['class']);

  return (
    <h3
      class={cn('text-2xl font-semibold leading-none tracking-tight', local.class)}
      {...others}
    />
  );
};

const CardDescription: ParentComponent<ComponentProps<'p'>> = (props) => {
  const [local, others] = splitProps(props, ['class']);

  return <p class={cn('text-sm text-muted-foreground', local.class)} {...others} />;
};

const CardContent: ParentComponent<ComponentProps<'div'>> = (props) => {
  const [local, others] = splitProps(props, ['class']);

  return <div class={cn('p-6 pt-0', local.class)} {...others} />;
};

const CardFooter: ParentComponent<ComponentProps<'div'>> = (props) => {
  const [local, others] = splitProps(props, ['class']);

  return <div class={cn('flex items-center p-6 pt-0', local.class)} {...others} />;
};

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };
