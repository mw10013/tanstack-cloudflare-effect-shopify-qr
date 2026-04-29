/**
 * Formats Standard Schema field issues for Shopify UI error props.
 * TanStack Form's inferred meta error type includes undefined entries even when Effect emits required messages.
 * Dedupes by message because paths are not rendered here.
 */
export const fieldError = (
  errors: readonly ({ readonly message: string } | undefined)[],
) =>
  [
    ...new Map(
      errors.filter((error) => !!error).map((error) => [error.message, error]),
    ).values(),
  ]
    .map((error) => error.message)
    .join(", ");
