import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  addDecimals,
  type BalanceWithProduct,
  type HealthStatusByType,
  ProductEngineType,
  type SubaccountTx,
  toBigNumber,
} from '@nadohq/client';
import { z } from 'zod';

import type { NadoContext } from '../../context';
import { ToolExecutionError } from '../../utils/errors';
import { toJsonContent } from '../../utils/formatting';
import { resolveSubaccount } from '../../utils/resolveSubaccount';
import {
  type BalanceSide,
  BalanceSideSchema,
  OptionalSubaccountNameSchema,
  OptionalSubaccountOwnerSchema,
  ProductIdSchema,
} from '../../utils/schemas';

interface LiquidationPriceResult {
  productId: number;
  side: BalanceSide;
  amount: string;
  oraclePrice: string;
  liquidationPrice: string | null;
}

function computeLiquidationPrices(
  balances: BalanceWithProduct[],
  health: HealthStatusByType,
): LiquidationPriceResult[] {
  const maintenanceHealth = health.maintenance.health;
  const results: LiquidationPriceResult[] = [];

  for (const balance of balances) {
    if (balance.type !== ProductEngineType.PERP) continue;
    if (balance.amount.isZero()) continue;

    const isLong = balance.amount.isPositive();
    const weight = isLong
      ? balance.longWeightMaintenance
      : balance.shortWeightMaintenance;
    const denominator = balance.amount.multipliedBy(weight);

    if (denominator.isZero()) continue;

    // liq_price = oraclePrice - maintenanceHealth / (amount * weight)
    // amount and health are both x18, so they cancel; oraclePrice and weight are human-readable
    const liqPrice = balance.oraclePrice.minus(
      maintenanceHealth.dividedBy(denominator),
    );

    const isReachable = isLong ? liqPrice.isPositive() : true;

    results.push({
      productId: balance.productId,
      side: isLong ? 'long' : 'short',
      amount: balance.amount.toFixed(),
      oraclePrice: balance.oraclePrice.toFixed(),
      liquidationPrice: isReachable ? liqPrice.toFixed() : null,
    });
  }

  return results;
}

export function registerGetLiquidationPrice(
  server: McpServer,
  ctx: NadoContext,
): void {
  server.registerTool(
    'get_liquidation_price',
    {
      title: 'Get Liquidation Price',
      description:
        "Estimate liquidation prices for a subaccount's perp positions, optionally after simulating a hypothetical order. If order parameters (productId, side, amount, price) are provided, the engine simulates the order first and returns post-order liquidation prices. If omitted, returns liquidation prices for the current state. Uses maintenance health to determine the oracle price at which the account would be liquidated, per perp position.",
      inputSchema: {
        subaccountOwner: OptionalSubaccountOwnerSchema,
        subaccountName: OptionalSubaccountNameSchema,
        productId: ProductIdSchema.optional().describe(
          'Product ID for the hypothetical order. Required if simulating an order.',
        ),
        side: BalanceSideSchema.optional().describe(
          'Side of the hypothetical order: long (buy) or short (sell). Required if simulating an order.',
        ),
        amount: z
          .number()
          .positive()
          .optional()
          .describe(
            'Size of the hypothetical order in base units (e.g. 1.5 for 1.5 BTC). Required if simulating an order.',
          ),
        price: z
          .number()
          .positive()
          .optional()
          .describe(
            'Limit price for the hypothetical order. Required if simulating an order.',
          ),
      },
      annotations: { readOnlyHint: true },
    },
    async (input: {
      subaccountOwner?: string;
      subaccountName?: string;
      productId?: number;
      side?: BalanceSide;
      amount?: number;
      price?: number;
    }) => {
      const { subaccountOwner, subaccountName } = resolveSubaccount(ctx, input);
      const { productId, side, amount, price } = input;

      try {
        const hasOrder =
          productId != null && side != null && amount != null && price != null;
        const partialOrder =
          productId != null || side != null || amount != null || price != null;

        if (partialOrder && !hasOrder) {
          return {
            content: [
              {
                type: 'text',
                text: 'To simulate an order, all four parameters are required: productId, side, amount, and price. Omit all four to get liquidation prices for the current state.',
              },
            ],
            isError: true,
          };
        }

        let summary: {
          balances: BalanceWithProduct[];
          health: HealthStatusByType;
        };

        if (hasOrder) {
          const isLong = side === 'long';
          const amountDelta = addDecimals(isLong ? amount : -amount);
          const vQuoteDelta = addDecimals(
            isLong ? -(amount * price) : amount * price,
          );

          const txs: SubaccountTx[] = [
            {
              type: 'apply_delta',
              tx: {
                productId,
                amountDelta: toBigNumber(amountDelta),
                vQuoteDelta: toBigNumber(vQuoteDelta),
              },
            },
          ];

          summary =
            await ctx.client.subaccount.getEngineEstimatedSubaccountSummary({
              subaccountOwner,
              subaccountName,
              txs,
            });
        } else {
          summary = await ctx.client.subaccount.getSubaccountSummary({
            subaccountOwner,
            subaccountName,
          });
        }

        const liquidationPrices = computeLiquidationPrices(
          summary.balances,
          summary.health,
        );

        const result = {
          simulatedOrder: hasOrder ? { productId, side, amount, price } : null,
          health: {
            initial: summary.health.initial.health.toFixed(),
            maintenance: summary.health.maintenance.health.toFixed(),
          },
          liquidationPrices,
        };

        return {
          content: [{ type: 'text', text: toJsonContent(result) }],
        };
      } catch (err) {
        throw new ToolExecutionError(
          'get_liquidation_price',
          `Failed to compute liquidation prices for ${subaccountOwner}/${subaccountName}.`,
          err,
        );
      }
    },
  );
}
