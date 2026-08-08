/* eslint-disable */
/** Internal type. DO NOT USE DIRECTLY. */
type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
/** Internal type. DO NOT USE DIRECTLY. */
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
import type { DocumentTypeDecoration } from '@graphql-typed-document-node/core';
/**
 * A custom key-value pair that stores additional information on a [cart](https://shopify.dev/docs/api/storefront/current/objects/Cart) or [cart line](https://shopify.dev/docs/api/storefront/current/objects/CartLine). Attributes capture additional information like gift messages, special instructions, or custom order details. Learn more about [managing carts with the Storefront API](https://shopify.dev/docs/storefronts/headless/building-with-the-storefront-api/cart/manage).
 *
 */
export type AttributeInput = {
  /** Key or name of the attribute. */
  key: string;
  /** Value of the attribute. */
  value: string;
};

/**
 * Specifies a delivery address for a cart. Provide either a [`deliveryAddress`](https://shopify.dev/docs/api/storefront/current/input-objects/CartAddressInput#fields-deliveryAddress) with full address details, or a [`copyFromCustomerAddressId`](https://shopify.dev/docs/api/storefront/current/input-objects/CartAddressInput#fields-copyFromCustomerAddressId) to copy from an existing customer address. Used by [`CartSelectableAddressInput`](https://shopify.dev/docs/api/storefront/current/input-objects/CartSelectableAddressInput) and [`CartSelectableAddressUpdateInput`](https://shopify.dev/docs/api/storefront/current/input-objects/CartSelectableAddressUpdateInput).
 *
 */
export type CartAddressInput = {
  /** Copies details from the customer address to an address on this cart. */
  copyFromCustomerAddressId?: string | number | null | undefined;
  /** A delivery address stored on this cart. */
  deliveryAddress?: CartDeliveryAddressInput | null | undefined;
};

/**
 * The input fields for identifying the buyer associated with a cart. Buyer identity determines [international pricing](https://shopify.dev/docs/storefronts/headless/building-with-the-storefront-api/markets/international-pricing) and should match the customer's shipping address.
 *
 * Used by [`cartCreate`](https://shopify.dev/docs/api/storefront/current/mutations/cartCreate) and [`cartBuyerIdentityUpdate`](https://shopify.dev/docs/api/storefront/current/mutations/cartBuyerIdentityUpdate) to set contact information, location, and checkout preferences.
 *
 * > Note:
 * > Preferences prefill fields at checkout but don't sync back to the cart if overwritten.
 *
 */
export type CartBuyerIdentityInput = {
  /** The company location of the buyer that is interacting with the cart. */
  companyLocationId?: string | number | null | undefined;
  /** The country where the buyer is located. */
  countryCode?: CountryCode | null | undefined;
  /** The access token used to identify the customer associated with the cart. */
  customerAccessToken?: string | null | undefined;
  /** The email address of the buyer that is interacting with the cart. */
  email?: string | null | undefined;
  /** The phone number of the buyer that is interacting with the cart. */
  phone?: string | null | undefined;
  /**
   * A set of preferences tied to the buyer interacting with the cart. Preferences are used to prefill fields in at checkout to streamline information collection.
   * Preferences are not synced back to the cart if they are overwritten.
   *
   */
  preferences?: CartPreferencesInput | null | undefined;
};

/** The input fields to create or update a cart address. */
export type CartDeliveryAddressInput = {
  /**
   * The first line of the address. Typically the street address or PO Box number.
   *
   */
  address1?: string | null | undefined;
  /**
   * The second line of the address. Typically the number of the apartment, suite, or unit.
   *
   */
  address2?: string | null | undefined;
  /**
   * The name of the city, district, village, or town.
   *
   */
  city?: string | null | undefined;
  /**
   * The name of the customer's company or organization.
   *
   */
  company?: string | null | undefined;
  /** The name of the country. */
  countryCode?: CountryCode | null | undefined;
  /** The first name of the customer. */
  firstName?: string | null | undefined;
  /** The last name of the customer. */
  lastName?: string | null | undefined;
  /**
   * A unique phone number for the customer.
   *
   * Formatted using E.164 standard. For example, _+16135551111_.
   *
   */
  phone?: string | null | undefined;
  /** The region of the address, such as the province, state, or district. */
  provinceCode?: string | null | undefined;
  /** The zip or postal code of the address. */
  zip?: string | null | undefined;
};

/** Preferred location used to find the closest pick up point based on coordinates. */
export type CartDeliveryCoordinatesPreferenceInput = {
  /**
   * The two-letter code for the country of the preferred location.
   *
   * For example, US.
   *
   */
  countryCode: CountryCode;
  /** The geographic latitude for a given location. Coordinates are required in order to set pickUpHandle for pickup points. */
  latitude: number;
  /** The geographic longitude for a given location. Coordinates are required in order to set pickUpHandle for pickup points. */
  longitude: number;
};

/** The input fields for the cart's delivery properties. */
export type CartDeliveryInput = {
  /**
   * Selectable addresses to present to the buyer on the cart.
   *
   * The input must not contain more than `250` values.
   */
  addresses?: Array<CartSelectableAddressInput> | null | undefined;
};

/** Delivery preferences can be used to prefill the delivery section at checkout. */
export type CartDeliveryPreferenceInput = {
  /** The coordinates of a delivery location in order of preference. */
  coordinates?: CartDeliveryCoordinatesPreferenceInput | null | undefined;
  /**
   * The preferred delivery methods such as shipping, local pickup or through pickup points.
   *
   * The input must not contain more than `250` values.
   */
  deliveryMethod?: Array<PreferenceDeliveryMethodType> | null | undefined;
  /**
   * The pickup handle prefills checkout fields with the location for either local pickup or pickup points delivery methods.
   * It accepts both location ID for local pickup and external IDs for pickup points.
   *
   * The input must not contain more than `250` values.
   */
  pickupHandle?: Array<string> | null | undefined;
};

/**
 * Error codes returned by [`CartUserError`](https://shopify.dev/docs/api/storefront/current/objects/CartUserError) during cart mutations. Covers validation failures for addresses, quantities, delivery options, merchandise lines, discount codes, and metafields.
 *
 */
export type CartErrorCode =
  /** The specified address field contains emojis. */
  | 'ADDRESS_FIELD_CONTAINS_EMOJIS'
  /** The specified address field contains HTML tags. */
  | 'ADDRESS_FIELD_CONTAINS_HTML_TAGS'
  /** The specified address field contains a URL. */
  | 'ADDRESS_FIELD_CONTAINS_URL'
  /** The specified address field does not match the expected pattern. */
  | 'ADDRESS_FIELD_DOES_NOT_MATCH_EXPECTED_PATTERN'
  /** The specified address field is required. */
  | 'ADDRESS_FIELD_IS_REQUIRED'
  /** The specified address field is too long. */
  | 'ADDRESS_FIELD_IS_TOO_LONG'
  /** Bundles and addons cannot be mixed. */
  | 'BUNDLES_AND_ADDONS_CANNOT_BE_MIXED'
  /** Buyer cannot purchase for company location. */
  | 'BUYER_CANNOT_PURCHASE_FOR_COMPANY_LOCATION'
  /** The cart is too large to save. */
  | 'CART_TOO_LARGE'
  /** The specified gift card recipient is invalid. */
  | 'GIFT_CARD_RECIPIENT_INVALID'
  /** The input value is invalid. */
  | 'INVALID'
  /** Company location not found or not allowed. */
  | 'INVALID_COMPANY_LOCATION'
  /** The delivery address was not found. */
  | 'INVALID_DELIVERY_ADDRESS_ID'
  /** Delivery group was not found in cart. */
  | 'INVALID_DELIVERY_GROUP'
  /** Delivery option was not valid. */
  | 'INVALID_DELIVERY_OPTION'
  /** The quantity must be a multiple of the specified increment. */
  | 'INVALID_INCREMENT'
  /** Merchandise line was not found in cart. */
  | 'INVALID_MERCHANDISE_LINE'
  /** The metafields were not valid. */
  | 'INVALID_METAFIELDS'
  /** The payment wasn't valid. */
  | 'INVALID_PAYMENT'
  /** The payment is invalid. Deferred payment is required. */
  | 'INVALID_PAYMENT_DEFERRED_PAYMENT_REQUIRED'
  /** Cannot update payment on an empty cart */
  | 'INVALID_PAYMENT_EMPTY_CART'
  /** The given zip code is invalid for the provided country. */
  | 'INVALID_ZIP_CODE_FOR_COUNTRY'
  /** The given zip code is invalid for the provided province. */
  | 'INVALID_ZIP_CODE_FOR_PROVINCE'
  /** The input value should be less than the maximum value allowed. */
  | 'LESS_THAN'
  /** The quantity must be below the specified maximum for the item. */
  | 'MAXIMUM_EXCEEDED'
  /** An error occurred while processing cart transformations. */
  | 'MERCHANDISE_LINE_TRANSFORMERS_RUN_ERROR'
  /** Item cannot be purchased as configured. */
  | 'MERCHANDISE_NOT_APPLICABLE'
  /** The quantity must be above the specified minimum for the item. */
  | 'MINIMUM_NOT_MET'
  /** The customer access token is required when setting a company location. */
  | 'MISSING_CUSTOMER_ACCESS_TOKEN'
  /** Missing discount code. */
  | 'MISSING_DISCOUNT_CODE'
  /** Missing note. */
  | 'MISSING_NOTE'
  /** The note length must be below the specified maximum. */
  | 'NOTE_TOO_LONG'
  /** Only one delivery address can be selected. */
  | 'ONLY_ONE_DELIVERY_ADDRESS_CAN_BE_SELECTED'
  /** Cannot reference existing parent lines by variant_id. */
  | 'PARENT_LINE_INVALID_REFERENCE'
  /** Parent line nesting is too deep or circular. */
  | 'PARENT_LINE_NESTING_TOO_DEEP'
  /** Parent line not found. */
  | 'PARENT_LINE_NOT_FOUND'
  /** Nested cartlines are blocked due to an incompatibility. */
  | 'PARENT_LINE_OPERATION_BLOCKED'
  /** Credit card has expired. */
  | 'PAYMENTS_CREDIT_CARD_BASE_EXPIRED'
  /** Credit card gateway is not supported. */
  | 'PAYMENTS_CREDIT_CARD_BASE_GATEWAY_NOT_SUPPORTED'
  /** Credit card error. */
  | 'PAYMENTS_CREDIT_CARD_GENERIC'
  /** Credit card month is invalid. */
  | 'PAYMENTS_CREDIT_CARD_MONTH_INCLUSION'
  /** Credit card number is invalid. */
  | 'PAYMENTS_CREDIT_CARD_NUMBER_INVALID'
  /** Credit card number format is invalid. */
  | 'PAYMENTS_CREDIT_CARD_NUMBER_INVALID_FORMAT'
  /** Credit card verification value is blank. */
  | 'PAYMENTS_CREDIT_CARD_VERIFICATION_VALUE_BLANK'
  /** Credit card verification value is invalid for card type. */
  | 'PAYMENTS_CREDIT_CARD_VERIFICATION_VALUE_INVALID_FOR_CARD_TYPE'
  /** Credit card has expired. */
  | 'PAYMENTS_CREDIT_CARD_YEAR_EXPIRED'
  /** Credit card expiry year is invalid. */
  | 'PAYMENTS_CREDIT_CARD_YEAR_INVALID_EXPIRY_YEAR'
  /** The payment method is not applicable. */
  | 'PAYMENT_METHOD_NOT_APPLICABLE'
  /** The payment method is not supported. */
  | 'PAYMENT_METHOD_NOT_SUPPORTED'
  /** The delivery group is in a pending state. */
  | 'PENDING_DELIVERY_GROUPS'
  /** The given province cannot be found. */
  | 'PROVINCE_NOT_FOUND'
  /** Selling plan is not applicable. */
  | 'SELLING_PLAN_NOT_APPLICABLE'
  /** An error occurred while saving the cart. */
  | 'SERVICE_UNAVAILABLE'
  /** Too many delivery addresses on Cart. */
  | 'TOO_MANY_DELIVERY_ADDRESSES'
  /** A general error occurred during address validation. */
  | 'UNSPECIFIED_ADDRESS_ERROR'
  /** Validation failed. */
  | 'VALIDATION_CUSTOM'
  /** Variant can only be purchased with a selling plan. */
  | 'VARIANT_REQUIRES_SELLING_PLAN'
  /** The given zip code is unsupported. */
  | 'ZIP_CODE_NOT_SUPPORTED';

/**
 * The input fields for creating a [`Cart`](https://shopify.dev/docs/api/storefront/current/objects/Cart). Used by the [`cartCreate`](https://shopify.dev/docs/api/storefront/current/mutations/cartCreate) mutation.
 *
 * Accepts merchandise lines, discount codes, gift card codes, and a note. You can also set custom attributes, metafields, buyer identity for international pricing, and delivery addresses.
 *
 */
export type CartInput = {
  /**
   * An array of key-value pairs that contains additional information about the cart.
   *
   * The input must not contain more than `250` values.
   */
  attributes?: Array<AttributeInput> | null | undefined;
  /**
   * The customer associated with the cart. Used to determine [international pricing]
   * (https://shopify.dev/custom-storefronts/internationalization/international-pricing).
   * Buyer identity should match the customer's shipping address.
   *
   */
  buyerIdentity?: CartBuyerIdentityInput | null | undefined;
  /** The delivery-related fields for the cart. */
  delivery?: CartDeliveryInput | null | undefined;
  /**
   * The case-insensitive discount codes that the customer added at checkout.
   *
   * The input must not contain more than `250` values.
   */
  discountCodes?: Array<string> | null | undefined;
  /**
   * The case-insensitive gift card codes.
   *
   * The input must not contain more than `250` values.
   */
  giftCardCodes?: Array<string> | null | undefined;
  /**
   * A list of merchandise lines to add to the cart.
   *
   * The input must not contain more than `250` values.
   */
  lines?: Array<CartLineInput> | null | undefined;
  /**
   * The metafields to associate with this cart.
   *
   * The input must not contain more than `250` values.
   */
  metafields?: Array<CartInputMetafieldInput> | null | undefined;
  /**
   * A note that's associated with the cart. For example, the note can be a personalized message to the buyer.
   *
   */
  note?: string | null | undefined;
};

/**
 * The input fields for a cart metafield value to set.
 *
 * Cart metafields will be copied to order metafields at order creation time if there is a matching order metafield definition with the [`cart to order copyable`](https://shopify.dev/docs/apps/build/metafields/use-metafield-capabilities#cart-to-order-copyable) capability enabled.
 *
 */
export type CartInputMetafieldInput = {
  /** The key name of the metafield. */
  key: string;
  /**
   * The type of data that the cart metafield stores.
   * The type of data must be a [supported type](https://shopify.dev/apps/metafields/types).
   *
   */
  type: string;
  /**
   * The data to store in the cart metafield. The data is always stored as a string, regardless of the metafield's type.
   *
   */
  value: string;
};

/**
 * The input fields for adding a merchandise line to a cart. Each line represents a [`ProductVariant`](https://shopify.dev/docs/api/storefront/current/objects/ProductVariant) the buyer intends to purchase, along with the quantity and optional [`SellingPlan`](https://shopify.dev/docs/api/storefront/current/objects/SellingPlan) for subscriptions.
 *
 * Used by the [`cartCreate`](https://shopify.dev/docs/api/storefront/current/mutations/cartCreate) mutation when creating a cart with initial items, and the [`cartLinesAdd`](https://shopify.dev/docs/api/storefront/current/mutations/cartLinesAdd) mutation when adding items to an existing cart.
 *
 */
export type CartLineInput = {
  /**
   * An array of key-value pairs that contains additional information about the merchandise line.
   *
   * The input must not contain more than `250` values.
   */
  attributes?: Array<AttributeInput> | null | undefined;
  /** The ID of the merchandise that the buyer intends to purchase. */
  merchandiseId: string | number;
  /** The parent line item of the cart line. */
  parent?: CartLineParentInput | null | undefined;
  /** The quantity of the merchandise. */
  quantity?: number | null | undefined;
  /** The ID of the selling plan that the merchandise is being purchased with. */
  sellingPlanId?: string | number | null | undefined;
};

/** The parent line item of the cart line. */
export type CartLineParentInput = {
  /** The id of the parent line item. */
  lineId?: string | number | null | undefined;
  /** The ID of the parent line merchandise. */
  merchandiseId?: string | number | null | undefined;
};

/**
 * The input fields for updating a merchandise line in a cart. Used by the [`cartLinesUpdate`](https://shopify.dev/docs/api/storefront/current/mutations/cartLinesUpdate) mutation.
 *
 * Specify the line item's [`id`](https://shopify.dev/docs/api/storefront/current/input-objects/CartLineUpdateInput#fields-id) along with any fields to modify. You can change the quantity, swap the merchandise, update custom attributes, or associate a different selling plan.
 *
 */
export type CartLineUpdateInput = {
  /**
   * An array of key-value pairs that contains additional information about the merchandise line.
   *
   * The input must not contain more than `250` values.
   */
  attributes?: Array<AttributeInput> | null | undefined;
  /** The ID of the merchandise line. */
  id: string | number;
  /** The ID of the merchandise for the line item. */
  merchandiseId?: string | number | null | undefined;
  /** The quantity of the line item. */
  quantity?: number | null | undefined;
  /** The ID of the selling plan that the merchandise is being purchased with. */
  sellingPlanId?: string | number | null | undefined;
};

/** The input fields represent preferences for the buyer that is interacting with the cart. */
export type CartPreferencesInput = {
  /** Delivery preferences can be used to prefill the delivery section in at checkout. */
  delivery?: CartDeliveryPreferenceInput | null | undefined;
  /**
   * Wallet preferences are used to populate relevant payment fields in the checkout flow.
   * Accepted value: `["shop_pay"]`.
   *
   * The input must not contain more than `250` values.
   */
  wallet?: Array<string> | null | undefined;
};

/**
 * The input fields for a selectable delivery address to present to the buyer. Used by [`CartDeliveryInput`](https://shopify.dev/docs/api/storefront/current/input-objects/CartDeliveryInput) when creating a cart with the [`cartCreate`](https://shopify.dev/docs/api/storefront/current/mutations/cartCreate) mutation.
 *
 * You can pre-select an address for the buyer, mark it as one-time use so it isn't saved after checkout, and specify how strictly the address should be validated.
 *
 */
export type CartSelectableAddressInput = {
  /** Exactly one kind of delivery address. */
  address: CartAddressInput;
  /** When true, this delivery address will not be associated with the buyer after a successful checkout. */
  oneTimeUse?: boolean | null | undefined;
  /** Sets exactly one address as pre-selected for the buyer. */
  selected?: boolean | null | undefined;
  /** Defines what kind of address validation is requested. */
  validationStrategy?: DeliveryAddressValidationStrategy | null | undefined;
};

/**
 * The code designating a country/region, which generally follows ISO 3166-1 alpha-2 guidelines.
 * If a territory doesn't have a country code value in the `CountryCode` enum, then it might be considered a subdivision
 * of another country. For example, the territories associated with Spain are represented by the country code `ES`,
 * and the territories associated with the United States of America are represented by the country code `US`.
 *
 */
export type CountryCode =
  /** Ascension Island. */
  | 'AC'
  /** Andorra. */
  | 'AD'
  /** United Arab Emirates. */
  | 'AE'
  /** Afghanistan. */
  | 'AF'
  /** Antigua & Barbuda. */
  | 'AG'
  /** Anguilla. */
  | 'AI'
  /** Albania. */
  | 'AL'
  /** Armenia. */
  | 'AM'
  /** Netherlands Antilles. */
  | 'AN'
  /** Angola. */
  | 'AO'
  /** Argentina. */
  | 'AR'
  /** Austria. */
  | 'AT'
  /** Australia. */
  | 'AU'
  /** Aruba. */
  | 'AW'
  /** Åland Islands. */
  | 'AX'
  /** Azerbaijan. */
  | 'AZ'
  /** Bosnia & Herzegovina. */
  | 'BA'
  /** Barbados. */
  | 'BB'
  /** Bangladesh. */
  | 'BD'
  /** Belgium. */
  | 'BE'
  /** Burkina Faso. */
  | 'BF'
  /** Bulgaria. */
  | 'BG'
  /** Bahrain. */
  | 'BH'
  /** Burundi. */
  | 'BI'
  /** Benin. */
  | 'BJ'
  /** St. Barthélemy. */
  | 'BL'
  /** Bermuda. */
  | 'BM'
  /** Brunei. */
  | 'BN'
  /** Bolivia. */
  | 'BO'
  /** Caribbean Netherlands. */
  | 'BQ'
  /** Brazil. */
  | 'BR'
  /** Bahamas. */
  | 'BS'
  /** Bhutan. */
  | 'BT'
  /** Bouvet Island. */
  | 'BV'
  /** Botswana. */
  | 'BW'
  /** Belarus. */
  | 'BY'
  /** Belize. */
  | 'BZ'
  /** Canada. */
  | 'CA'
  /** Cocos (Keeling) Islands. */
  | 'CC'
  /** Congo - Kinshasa. */
  | 'CD'
  /** Central African Republic. */
  | 'CF'
  /** Congo - Brazzaville. */
  | 'CG'
  /** Switzerland. */
  | 'CH'
  /** Côte d’Ivoire. */
  | 'CI'
  /** Cook Islands. */
  | 'CK'
  /** Chile. */
  | 'CL'
  /** Cameroon. */
  | 'CM'
  /** China. */
  | 'CN'
  /** Colombia. */
  | 'CO'
  /** Costa Rica. */
  | 'CR'
  /** Cuba. */
  | 'CU'
  /** Cape Verde. */
  | 'CV'
  /** Curaçao. */
  | 'CW'
  /** Christmas Island. */
  | 'CX'
  /** Cyprus. */
  | 'CY'
  /** Czechia. */
  | 'CZ'
  /** Germany. */
  | 'DE'
  /** Djibouti. */
  | 'DJ'
  /** Denmark. */
  | 'DK'
  /** Dominica. */
  | 'DM'
  /** Dominican Republic. */
  | 'DO'
  /** Algeria. */
  | 'DZ'
  /** Ecuador. */
  | 'EC'
  /** Estonia. */
  | 'EE'
  /** Egypt. */
  | 'EG'
  /** Western Sahara. */
  | 'EH'
  /** Eritrea. */
  | 'ER'
  /** Spain. */
  | 'ES'
  /** Ethiopia. */
  | 'ET'
  /** Finland. */
  | 'FI'
  /** Fiji. */
  | 'FJ'
  /** Falkland Islands. */
  | 'FK'
  /** Faroe Islands. */
  | 'FO'
  /** France. */
  | 'FR'
  /** Gabon. */
  | 'GA'
  /** United Kingdom. */
  | 'GB'
  /** Grenada. */
  | 'GD'
  /** Georgia. */
  | 'GE'
  /** French Guiana. */
  | 'GF'
  /** Guernsey. */
  | 'GG'
  /** Ghana. */
  | 'GH'
  /** Gibraltar. */
  | 'GI'
  /** Greenland. */
  | 'GL'
  /** Gambia. */
  | 'GM'
  /** Guinea. */
  | 'GN'
  /** Guadeloupe. */
  | 'GP'
  /** Equatorial Guinea. */
  | 'GQ'
  /** Greece. */
  | 'GR'
  /** South Georgia & South Sandwich Islands. */
  | 'GS'
  /** Guatemala. */
  | 'GT'
  /** Guinea-Bissau. */
  | 'GW'
  /** Guyana. */
  | 'GY'
  /** Hong Kong SAR. */
  | 'HK'
  /** Heard & McDonald Islands. */
  | 'HM'
  /** Honduras. */
  | 'HN'
  /** Croatia. */
  | 'HR'
  /** Haiti. */
  | 'HT'
  /** Hungary. */
  | 'HU'
  /** Indonesia. */
  | 'ID'
  /** Ireland. */
  | 'IE'
  /** Israel. */
  | 'IL'
  /** Isle of Man. */
  | 'IM'
  /** India. */
  | 'IN'
  /** British Indian Ocean Territory. */
  | 'IO'
  /** Iraq. */
  | 'IQ'
  /** Iran. */
  | 'IR'
  /** Iceland. */
  | 'IS'
  /** Italy. */
  | 'IT'
  /** Jersey. */
  | 'JE'
  /** Jamaica. */
  | 'JM'
  /** Jordan. */
  | 'JO'
  /** Japan. */
  | 'JP'
  /** Kenya. */
  | 'KE'
  /** Kyrgyzstan. */
  | 'KG'
  /** Cambodia. */
  | 'KH'
  /** Kiribati. */
  | 'KI'
  /** Comoros. */
  | 'KM'
  /** St. Kitts & Nevis. */
  | 'KN'
  /** North Korea. */
  | 'KP'
  /** South Korea. */
  | 'KR'
  /** Kuwait. */
  | 'KW'
  /** Cayman Islands. */
  | 'KY'
  /** Kazakhstan. */
  | 'KZ'
  /** Laos. */
  | 'LA'
  /** Lebanon. */
  | 'LB'
  /** St. Lucia. */
  | 'LC'
  /** Liechtenstein. */
  | 'LI'
  /** Sri Lanka. */
  | 'LK'
  /** Liberia. */
  | 'LR'
  /** Lesotho. */
  | 'LS'
  /** Lithuania. */
  | 'LT'
  /** Luxembourg. */
  | 'LU'
  /** Latvia. */
  | 'LV'
  /** Libya. */
  | 'LY'
  /** Morocco. */
  | 'MA'
  /** Monaco. */
  | 'MC'
  /** Moldova. */
  | 'MD'
  /** Montenegro. */
  | 'ME'
  /** St. Martin. */
  | 'MF'
  /** Madagascar. */
  | 'MG'
  /** North Macedonia. */
  | 'MK'
  /** Mali. */
  | 'ML'
  /** Myanmar (Burma). */
  | 'MM'
  /** Mongolia. */
  | 'MN'
  /** Macao SAR. */
  | 'MO'
  /** Martinique. */
  | 'MQ'
  /** Mauritania. */
  | 'MR'
  /** Montserrat. */
  | 'MS'
  /** Malta. */
  | 'MT'
  /** Mauritius. */
  | 'MU'
  /** Maldives. */
  | 'MV'
  /** Malawi. */
  | 'MW'
  /** Mexico. */
  | 'MX'
  /** Malaysia. */
  | 'MY'
  /** Mozambique. */
  | 'MZ'
  /** Namibia. */
  | 'NA'
  /** New Caledonia. */
  | 'NC'
  /** Niger. */
  | 'NE'
  /** Norfolk Island. */
  | 'NF'
  /** Nigeria. */
  | 'NG'
  /** Nicaragua. */
  | 'NI'
  /** Netherlands. */
  | 'NL'
  /** Norway. */
  | 'NO'
  /** Nepal. */
  | 'NP'
  /** Nauru. */
  | 'NR'
  /** Niue. */
  | 'NU'
  /** New Zealand. */
  | 'NZ'
  /** Oman. */
  | 'OM'
  /** Panama. */
  | 'PA'
  /** Peru. */
  | 'PE'
  /** French Polynesia. */
  | 'PF'
  /** Papua New Guinea. */
  | 'PG'
  /** Philippines. */
  | 'PH'
  /** Pakistan. */
  | 'PK'
  /** Poland. */
  | 'PL'
  /** St. Pierre & Miquelon. */
  | 'PM'
  /** Pitcairn Islands. */
  | 'PN'
  /** Palestinian Territories. */
  | 'PS'
  /** Portugal. */
  | 'PT'
  /** Paraguay. */
  | 'PY'
  /** Qatar. */
  | 'QA'
  /** Réunion. */
  | 'RE'
  /** Romania. */
  | 'RO'
  /** Serbia. */
  | 'RS'
  /** Russia. */
  | 'RU'
  /** Rwanda. */
  | 'RW'
  /** Saudi Arabia. */
  | 'SA'
  /** Solomon Islands. */
  | 'SB'
  /** Seychelles. */
  | 'SC'
  /** Sudan. */
  | 'SD'
  /** Sweden. */
  | 'SE'
  /** Singapore. */
  | 'SG'
  /** St. Helena. */
  | 'SH'
  /** Slovenia. */
  | 'SI'
  /** Svalbard & Jan Mayen. */
  | 'SJ'
  /** Slovakia. */
  | 'SK'
  /** Sierra Leone. */
  | 'SL'
  /** San Marino. */
  | 'SM'
  /** Senegal. */
  | 'SN'
  /** Somalia. */
  | 'SO'
  /** Suriname. */
  | 'SR'
  /** South Sudan. */
  | 'SS'
  /** São Tomé & Príncipe. */
  | 'ST'
  /** El Salvador. */
  | 'SV'
  /** Sint Maarten. */
  | 'SX'
  /** Syria. */
  | 'SY'
  /** Eswatini. */
  | 'SZ'
  /** Tristan da Cunha. */
  | 'TA'
  /** Turks & Caicos Islands. */
  | 'TC'
  /** Chad. */
  | 'TD'
  /** French Southern Territories. */
  | 'TF'
  /** Togo. */
  | 'TG'
  /** Thailand. */
  | 'TH'
  /** Tajikistan. */
  | 'TJ'
  /** Tokelau. */
  | 'TK'
  /** Timor-Leste. */
  | 'TL'
  /** Turkmenistan. */
  | 'TM'
  /** Tunisia. */
  | 'TN'
  /** Tonga. */
  | 'TO'
  /** Türkiye. */
  | 'TR'
  /** Trinidad & Tobago. */
  | 'TT'
  /** Tuvalu. */
  | 'TV'
  /** Taiwan. */
  | 'TW'
  /** Tanzania. */
  | 'TZ'
  /** Ukraine. */
  | 'UA'
  /** Uganda. */
  | 'UG'
  /** U.S. Outlying Islands. */
  | 'UM'
  /** United States. */
  | 'US'
  /** Uruguay. */
  | 'UY'
  /** Uzbekistan. */
  | 'UZ'
  /** Vatican City. */
  | 'VA'
  /** St. Vincent & Grenadines. */
  | 'VC'
  /** Venezuela. */
  | 'VE'
  /** British Virgin Islands. */
  | 'VG'
  /** Vietnam. */
  | 'VN'
  /** Vanuatu. */
  | 'VU'
  /** Wallis & Futuna. */
  | 'WF'
  /** Samoa. */
  | 'WS'
  /** Kosovo. */
  | 'XK'
  /** Yemen. */
  | 'YE'
  /** Mayotte. */
  | 'YT'
  /** South Africa. */
  | 'ZA'
  /** Zambia. */
  | 'ZM'
  /** Zimbabwe. */
  | 'ZW'
  /** Unknown Region. */
  | 'ZZ';

/**
 * The three-letter currency codes that represent the world currencies used in
 * stores. These include standard ISO 4217 codes, legacy codes,
 * and non-standard codes.
 *
 */
export type CurrencyCode =
  /** United Arab Emirates Dirham (AED). */
  | 'AED'
  /** Afghan Afghani (AFN). */
  | 'AFN'
  /** Albanian Lek (ALL). */
  | 'ALL'
  /** Armenian Dram (AMD). */
  | 'AMD'
  /** Netherlands Antillean Guilder. */
  | 'ANG'
  /** Angolan Kwanza (AOA). */
  | 'AOA'
  /** Argentine Pesos (ARS). */
  | 'ARS'
  /** Australian Dollars (AUD). */
  | 'AUD'
  /** Aruban Florin (AWG). */
  | 'AWG'
  /** Azerbaijani Manat (AZN). */
  | 'AZN'
  /** Bosnia and Herzegovina Convertible Mark (BAM). */
  | 'BAM'
  /** Barbadian Dollar (BBD). */
  | 'BBD'
  /** Bangladesh Taka (BDT). */
  | 'BDT'
  /** Bulgarian Lev (BGN). */
  | 'BGN'
  /** Bahraini Dinar (BHD). */
  | 'BHD'
  /** Burundian Franc (BIF). */
  | 'BIF'
  /** Bermudian Dollar (BMD). */
  | 'BMD'
  /** Brunei Dollar (BND). */
  | 'BND'
  /** Bolivian Boliviano (BOB). */
  | 'BOB'
  /** Brazilian Real (BRL). */
  | 'BRL'
  /** Bahamian Dollar (BSD). */
  | 'BSD'
  /** Bhutanese Ngultrum (BTN). */
  | 'BTN'
  /** Botswana Pula (BWP). */
  | 'BWP'
  /** Belarusian Ruble (BYN). */
  | 'BYN'
  /** Belarusian Ruble (BYR). */
  | 'BYR'
  /** Belize Dollar (BZD). */
  | 'BZD'
  /** Canadian Dollars (CAD). */
  | 'CAD'
  /** Congolese franc (CDF). */
  | 'CDF'
  /** Swiss Francs (CHF). */
  | 'CHF'
  /** Chilean Peso (CLP). */
  | 'CLP'
  /** Chinese Yuan Renminbi (CNY). */
  | 'CNY'
  /** Colombian Peso (COP). */
  | 'COP'
  /** Costa Rican Colones (CRC). */
  | 'CRC'
  /** Cape Verdean escudo (CVE). */
  | 'CVE'
  /** Czech Koruny (CZK). */
  | 'CZK'
  /** Djiboutian Franc (DJF). */
  | 'DJF'
  /** Danish Kroner (DKK). */
  | 'DKK'
  /** Dominican Peso (DOP). */
  | 'DOP'
  /** Algerian Dinar (DZD). */
  | 'DZD'
  /** Egyptian Pound (EGP). */
  | 'EGP'
  /** Eritrean Nakfa (ERN). */
  | 'ERN'
  /** Ethiopian Birr (ETB). */
  | 'ETB'
  /** Euro (EUR). */
  | 'EUR'
  /** Fijian Dollars (FJD). */
  | 'FJD'
  /** Falkland Islands Pounds (FKP). */
  | 'FKP'
  /** United Kingdom Pounds (GBP). */
  | 'GBP'
  /** Georgian Lari (GEL). */
  | 'GEL'
  /** Ghanaian Cedi (GHS). */
  | 'GHS'
  /** Gibraltar Pounds (GIP). */
  | 'GIP'
  /** Gambian Dalasi (GMD). */
  | 'GMD'
  /** Guinean Franc (GNF). */
  | 'GNF'
  /** Guatemalan Quetzal (GTQ). */
  | 'GTQ'
  /** Guyanese Dollar (GYD). */
  | 'GYD'
  /** Hong Kong Dollars (HKD). */
  | 'HKD'
  /** Honduran Lempira (HNL). */
  | 'HNL'
  /** Croatian Kuna (HRK). */
  | 'HRK'
  /** Haitian Gourde (HTG). */
  | 'HTG'
  /** Hungarian Forint (HUF). */
  | 'HUF'
  /** Indonesian Rupiah (IDR). */
  | 'IDR'
  /** Israeli New Shekel (NIS). */
  | 'ILS'
  /** Indian Rupees (INR). */
  | 'INR'
  /** Iraqi Dinar (IQD). */
  | 'IQD'
  /** Iranian Rial (IRR). */
  | 'IRR'
  /** Icelandic Kronur (ISK). */
  | 'ISK'
  /** Jersey Pound. */
  | 'JEP'
  /** Jamaican Dollars (JMD). */
  | 'JMD'
  /** Jordanian Dinar (JOD). */
  | 'JOD'
  /** Japanese Yen (JPY). */
  | 'JPY'
  /** Kenyan Shilling (KES). */
  | 'KES'
  /** Kyrgyzstani Som (KGS). */
  | 'KGS'
  /** Cambodian Riel. */
  | 'KHR'
  /** Kiribati Dollar (KID). */
  | 'KID'
  /** Comorian Franc (KMF). */
  | 'KMF'
  /** South Korean Won (KRW). */
  | 'KRW'
  /** Kuwaiti Dinar (KWD). */
  | 'KWD'
  /** Cayman Dollars (KYD). */
  | 'KYD'
  /** Kazakhstani Tenge (KZT). */
  | 'KZT'
  /** Laotian Kip (LAK). */
  | 'LAK'
  /** Lebanese Pounds (LBP). */
  | 'LBP'
  /** Sri Lankan Rupees (LKR). */
  | 'LKR'
  /** Liberian Dollar (LRD). */
  | 'LRD'
  /** Lesotho Loti (LSL). */
  | 'LSL'
  /** Lithuanian Litai (LTL). */
  | 'LTL'
  /** Latvian Lati (LVL). */
  | 'LVL'
  /** Libyan Dinar (LYD). */
  | 'LYD'
  /** Moroccan Dirham. */
  | 'MAD'
  /** Moldovan Leu (MDL). */
  | 'MDL'
  /** Malagasy Ariary (MGA). */
  | 'MGA'
  /** Macedonia Denar (MKD). */
  | 'MKD'
  /** Burmese Kyat (MMK). */
  | 'MMK'
  /** Mongolian Tugrik. */
  | 'MNT'
  /** Macanese Pataca (MOP). */
  | 'MOP'
  /** Mauritanian Ouguiya (MRU). */
  | 'MRU'
  /** Mauritian Rupee (MUR). */
  | 'MUR'
  /** Maldivian Rufiyaa (MVR). */
  | 'MVR'
  /** Malawian Kwacha (MWK). */
  | 'MWK'
  /** Mexican Pesos (MXN). */
  | 'MXN'
  /** Malaysian Ringgits (MYR). */
  | 'MYR'
  /** Mozambican Metical. */
  | 'MZN'
  /** Namibian Dollar. */
  | 'NAD'
  /** Nigerian Naira (NGN). */
  | 'NGN'
  /** Nicaraguan Córdoba (NIO). */
  | 'NIO'
  /** Norwegian Kroner (NOK). */
  | 'NOK'
  /** Nepalese Rupee (NPR). */
  | 'NPR'
  /** New Zealand Dollars (NZD). */
  | 'NZD'
  /** Omani Rial (OMR). */
  | 'OMR'
  /** Panamian Balboa (PAB). */
  | 'PAB'
  /** Peruvian Nuevo Sol (PEN). */
  | 'PEN'
  /** Papua New Guinean Kina (PGK). */
  | 'PGK'
  /** Philippine Peso (PHP). */
  | 'PHP'
  /** Pakistani Rupee (PKR). */
  | 'PKR'
  /** Polish Zlotych (PLN). */
  | 'PLN'
  /** Paraguayan Guarani (PYG). */
  | 'PYG'
  /** Qatari Rial (QAR). */
  | 'QAR'
  /** Romanian Lei (RON). */
  | 'RON'
  /** Serbian dinar (RSD). */
  | 'RSD'
  /** Russian Rubles (RUB). */
  | 'RUB'
  /** Rwandan Franc (RWF). */
  | 'RWF'
  /** Saudi Riyal (SAR). */
  | 'SAR'
  /** Solomon Islands Dollar (SBD). */
  | 'SBD'
  /** Seychellois Rupee (SCR). */
  | 'SCR'
  /** Sudanese Pound (SDG). */
  | 'SDG'
  /** Swedish Kronor (SEK). */
  | 'SEK'
  /** Singapore Dollars (SGD). */
  | 'SGD'
  /** Saint Helena Pounds (SHP). */
  | 'SHP'
  /** Sierra Leonean Leone (SLL). */
  | 'SLL'
  /** Somali Shilling (SOS). */
  | 'SOS'
  /** Surinamese Dollar (SRD). */
  | 'SRD'
  /** South Sudanese Pound (SSP). */
  | 'SSP'
  /** Sao Tome And Principe Dobra (STD). */
  | 'STD'
  /** Sao Tome And Principe Dobra (STN). */
  | 'STN'
  /** Syrian Pound (SYP). */
  | 'SYP'
  /** Swazi Lilangeni (SZL). */
  | 'SZL'
  /** Thai baht (THB). */
  | 'THB'
  /** Tajikistani Somoni (TJS). */
  | 'TJS'
  /** Turkmenistani Manat (TMT). */
  | 'TMT'
  /** Tunisian Dinar (TND). */
  | 'TND'
  /** Tongan Pa'anga (TOP). */
  | 'TOP'
  /** Turkish Lira (TRY). */
  | 'TRY'
  /** Trinidad and Tobago Dollars (TTD). */
  | 'TTD'
  /** Taiwan Dollars (TWD). */
  | 'TWD'
  /** Tanzanian Shilling (TZS). */
  | 'TZS'
  /** Ukrainian Hryvnia (UAH). */
  | 'UAH'
  /** Ugandan Shilling (UGX). */
  | 'UGX'
  /** United States Dollars (USD). */
  | 'USD'
  /** Uruguayan Pesos (UYU). */
  | 'UYU'
  /** Uzbekistan som (UZS). */
  | 'UZS'
  /** Venezuelan Bolivares (VED). */
  | 'VED'
  /** Venezuelan Bolivares (VEF). */
  | 'VEF'
  /** Venezuelan Bolivares Soberanos (VES). */
  | 'VES'
  /** Vietnamese đồng (VND). */
  | 'VND'
  /** Vanuatu Vatu (VUV). */
  | 'VUV'
  /** Samoan Tala (WST). */
  | 'WST'
  /** Central African CFA Franc (XAF). */
  | 'XAF'
  /** East Caribbean Dollar (XCD). */
  | 'XCD'
  /** West African CFA franc (XOF). */
  | 'XOF'
  /** CFP Franc (XPF). */
  | 'XPF'
  /** Unrecognized currency. */
  | 'XXX'
  /** Yemeni Rial (YER). */
  | 'YER'
  /** South African Rand (ZAR). */
  | 'ZAR'
  /** Zambian Kwacha (ZMW). */
  | 'ZMW';

/**
 * Controls how delivery addresses are validated during cart operations. The default validation checks only the country code, while strict validation verifies all address fields against Shopify's checkout rules and rejects invalid addresses.
 *
 * Used by [`DeliveryAddressInput`](https://shopify.dev/docs/api/storefront/current/input-objects/DeliveryAddressInput) when setting buyer identity preferences, and by [`CartSelectableAddressInput`](https://shopify.dev/docs/api/storefront/current/input-objects/CartSelectableAddressInput) and [`CartSelectableAddressUpdateInput`](https://shopify.dev/docs/api/storefront/current/input-objects/CartSelectableAddressUpdateInput) when managing cart delivery addresses.
 *
 */
export type DeliveryAddressValidationStrategy =
  /** Only the country code is validated. */
  | 'COUNTRY_CODE_ONLY'
  /**
   * Strict validation is performed, i.e. all fields in the address are validated
   * according to Shopify's checkout rules. If the address fails validation, the cart will not be updated.
   *
   */
  | 'STRICT';

/** The preferred delivery methods such as shipping, local pickup or through pickup points. */
export type PreferenceDeliveryMethodType =
  /** A delivery method used to let buyers collect purchases at designated locations like parcel lockers. */
  | 'PICKUP_POINT'
  /** A delivery method used to let buyers receive items directly from a specific location within an area. */
  | 'PICK_UP'
  /** A delivery method used to send items directly to a buyer’s specified address. */
  | 'SHIPPING';

export type CollectionProductsQueryVariables = Exact<{
  handle: string;
  first: number;
}>;


export type CollectionProductsQuery = { collection: { id: string, title: string, description: string, products: { nodes: Array<{ id: string, handle: string, title: string, featuredImage: { url: string, altText: string | null, width: number | null, height: number | null } | null, priceRange: { minVariantPrice: { amount: string, currencyCode: CurrencyCode } } }> } } | null };

export type ProductByHandleQueryVariables = Exact<{
  handle: string;
}>;


export type ProductByHandleQuery = { product: { id: string, handle: string, title: string, description: string, vendor: string, compareAtPriceRange: { minVariantPrice: { amount: string, currencyCode: CurrencyCode } }, featuredImage: { url: string, altText: string | null, width: number | null, height: number | null } | null, images: { nodes: Array<{ url: string, altText: string | null, width: number | null, height: number | null }> }, priceRange: { minVariantPrice: { amount: string, currencyCode: CurrencyCode } }, options: Array<{ name: string, optionValues: Array<{ name: string }> }>, sellingPlanGroups: { nodes: Array<{ name: string, appName: string | null, options: Array<{ name: string, values: Array<string> }>, sellingPlans: { nodes: Array<{ id: string }> } }> }, variants: { nodes: Array<{ id: string, title: string, availableForSale: boolean, selectedOptions: Array<{ name: string, value: string }>, price: { amount: string, currencyCode: CurrencyCode }, compareAtPrice: { amount: string, currencyCode: CurrencyCode } | null, image: { url: string, altText: string | null, width: number | null, height: number | null } | null, sellingPlanAllocations: { nodes: Array<{ sellingPlan: { id: string, name: string }, priceAdjustments: Array<{ price: { amount: string, currencyCode: CurrencyCode } }> }> } }> } } | null };

export type ShopNameQueryVariables = Exact<{ [key: string]: never; }>;


export type ShopNameQuery = { shop: { name: string, primaryDomain: { url: string } } };

export type CartFieldsFragment = { id: string, checkoutUrl: string, totalQuantity: number, buyerIdentity: { countryCode: CountryCode | null }, cost: { subtotalAmount: { amount: string, currencyCode: CurrencyCode }, totalAmount: { amount: string, currencyCode: CurrencyCode }, totalTaxAmount: { amount: string, currencyCode: CurrencyCode } | null }, lines: { nodes: Array<
      | { id: string, quantity: number, cost: { totalAmount: { amount: string, currencyCode: CurrencyCode } }, merchandise: { id: string, title: string, availableForSale: boolean, image: { url: string, altText: string | null, width: number | null, height: number | null } | null, price: { amount: string, currencyCode: CurrencyCode }, selectedOptions: Array<{ name: string, value: string }>, product: { handle: string, title: string } }, sellingPlanAllocation: { sellingPlan: { id: string, name: string } } | null }
      | { id: string, quantity: number, cost: { totalAmount: { amount: string, currencyCode: CurrencyCode } }, merchandise: { id: string, title: string, availableForSale: boolean, image: { url: string, altText: string | null, width: number | null, height: number | null } | null, price: { amount: string, currencyCode: CurrencyCode }, selectedOptions: Array<{ name: string, value: string }>, product: { handle: string, title: string } }, sellingPlanAllocation: { sellingPlan: { id: string, name: string } } | null }
    > } };

export type CartQueryVariables = Exact<{
  id: string | number;
}>;


export type CartQuery = { cart: { id: string, checkoutUrl: string, totalQuantity: number, buyerIdentity: { countryCode: CountryCode | null }, cost: { subtotalAmount: { amount: string, currencyCode: CurrencyCode }, totalAmount: { amount: string, currencyCode: CurrencyCode }, totalTaxAmount: { amount: string, currencyCode: CurrencyCode } | null }, lines: { nodes: Array<
        | { id: string, quantity: number, cost: { totalAmount: { amount: string, currencyCode: CurrencyCode } }, merchandise: { id: string, title: string, availableForSale: boolean, image: { url: string, altText: string | null, width: number | null, height: number | null } | null, price: { amount: string, currencyCode: CurrencyCode }, selectedOptions: Array<{ name: string, value: string }>, product: { handle: string, title: string } }, sellingPlanAllocation: { sellingPlan: { id: string, name: string } } | null }
        | { id: string, quantity: number, cost: { totalAmount: { amount: string, currencyCode: CurrencyCode } }, merchandise: { id: string, title: string, availableForSale: boolean, image: { url: string, altText: string | null, width: number | null, height: number | null } | null, price: { amount: string, currencyCode: CurrencyCode }, selectedOptions: Array<{ name: string, value: string }>, product: { handle: string, title: string } }, sellingPlanAllocation: { sellingPlan: { id: string, name: string } } | null }
      > } } | null };

export type CartCreateMutationVariables = Exact<{
  input: CartInput;
}>;


export type CartCreateMutation = { cartCreate: { cart: { id: string, checkoutUrl: string, totalQuantity: number, buyerIdentity: { countryCode: CountryCode | null }, cost: { subtotalAmount: { amount: string, currencyCode: CurrencyCode }, totalAmount: { amount: string, currencyCode: CurrencyCode }, totalTaxAmount: { amount: string, currencyCode: CurrencyCode } | null }, lines: { nodes: Array<
          | { id: string, quantity: number, cost: { totalAmount: { amount: string, currencyCode: CurrencyCode } }, merchandise: { id: string, title: string, availableForSale: boolean, image: { url: string, altText: string | null, width: number | null, height: number | null } | null, price: { amount: string, currencyCode: CurrencyCode }, selectedOptions: Array<{ name: string, value: string }>, product: { handle: string, title: string } }, sellingPlanAllocation: { sellingPlan: { id: string, name: string } } | null }
          | { id: string, quantity: number, cost: { totalAmount: { amount: string, currencyCode: CurrencyCode } }, merchandise: { id: string, title: string, availableForSale: boolean, image: { url: string, altText: string | null, width: number | null, height: number | null } | null, price: { amount: string, currencyCode: CurrencyCode }, selectedOptions: Array<{ name: string, value: string }>, product: { handle: string, title: string } }, sellingPlanAllocation: { sellingPlan: { id: string, name: string } } | null }
        > } } | null, userErrors: Array<{ field: Array<string> | null, message: string, code: CartErrorCode | null }> } | null };

export type CartLinesAddMutationVariables = Exact<{
  cartId: string | number;
  lines: Array<CartLineInput> | CartLineInput;
}>;


export type CartLinesAddMutation = { cartLinesAdd: { cart: { id: string, checkoutUrl: string, totalQuantity: number, buyerIdentity: { countryCode: CountryCode | null }, cost: { subtotalAmount: { amount: string, currencyCode: CurrencyCode }, totalAmount: { amount: string, currencyCode: CurrencyCode }, totalTaxAmount: { amount: string, currencyCode: CurrencyCode } | null }, lines: { nodes: Array<
          | { id: string, quantity: number, cost: { totalAmount: { amount: string, currencyCode: CurrencyCode } }, merchandise: { id: string, title: string, availableForSale: boolean, image: { url: string, altText: string | null, width: number | null, height: number | null } | null, price: { amount: string, currencyCode: CurrencyCode }, selectedOptions: Array<{ name: string, value: string }>, product: { handle: string, title: string } }, sellingPlanAllocation: { sellingPlan: { id: string, name: string } } | null }
          | { id: string, quantity: number, cost: { totalAmount: { amount: string, currencyCode: CurrencyCode } }, merchandise: { id: string, title: string, availableForSale: boolean, image: { url: string, altText: string | null, width: number | null, height: number | null } | null, price: { amount: string, currencyCode: CurrencyCode }, selectedOptions: Array<{ name: string, value: string }>, product: { handle: string, title: string } }, sellingPlanAllocation: { sellingPlan: { id: string, name: string } } | null }
        > } } | null, userErrors: Array<{ field: Array<string> | null, message: string, code: CartErrorCode | null }> } | null };

export type CartLinesUpdateMutationVariables = Exact<{
  cartId: string | number;
  lines: Array<CartLineUpdateInput> | CartLineUpdateInput;
}>;


export type CartLinesUpdateMutation = { cartLinesUpdate: { cart: { id: string, checkoutUrl: string, totalQuantity: number, buyerIdentity: { countryCode: CountryCode | null }, cost: { subtotalAmount: { amount: string, currencyCode: CurrencyCode }, totalAmount: { amount: string, currencyCode: CurrencyCode }, totalTaxAmount: { amount: string, currencyCode: CurrencyCode } | null }, lines: { nodes: Array<
          | { id: string, quantity: number, cost: { totalAmount: { amount: string, currencyCode: CurrencyCode } }, merchandise: { id: string, title: string, availableForSale: boolean, image: { url: string, altText: string | null, width: number | null, height: number | null } | null, price: { amount: string, currencyCode: CurrencyCode }, selectedOptions: Array<{ name: string, value: string }>, product: { handle: string, title: string } }, sellingPlanAllocation: { sellingPlan: { id: string, name: string } } | null }
          | { id: string, quantity: number, cost: { totalAmount: { amount: string, currencyCode: CurrencyCode } }, merchandise: { id: string, title: string, availableForSale: boolean, image: { url: string, altText: string | null, width: number | null, height: number | null } | null, price: { amount: string, currencyCode: CurrencyCode }, selectedOptions: Array<{ name: string, value: string }>, product: { handle: string, title: string } }, sellingPlanAllocation: { sellingPlan: { id: string, name: string } } | null }
        > } } | null, userErrors: Array<{ field: Array<string> | null, message: string, code: CartErrorCode | null }> } | null };

export type CartLinesRemoveMutationVariables = Exact<{
  cartId: string | number;
  lineIds: Array<string | number> | string | number;
}>;


export type CartLinesRemoveMutation = { cartLinesRemove: { cart: { id: string, checkoutUrl: string, totalQuantity: number, buyerIdentity: { countryCode: CountryCode | null }, cost: { subtotalAmount: { amount: string, currencyCode: CurrencyCode }, totalAmount: { amount: string, currencyCode: CurrencyCode }, totalTaxAmount: { amount: string, currencyCode: CurrencyCode } | null }, lines: { nodes: Array<
          | { id: string, quantity: number, cost: { totalAmount: { amount: string, currencyCode: CurrencyCode } }, merchandise: { id: string, title: string, availableForSale: boolean, image: { url: string, altText: string | null, width: number | null, height: number | null } | null, price: { amount: string, currencyCode: CurrencyCode }, selectedOptions: Array<{ name: string, value: string }>, product: { handle: string, title: string } }, sellingPlanAllocation: { sellingPlan: { id: string, name: string } } | null }
          | { id: string, quantity: number, cost: { totalAmount: { amount: string, currencyCode: CurrencyCode } }, merchandise: { id: string, title: string, availableForSale: boolean, image: { url: string, altText: string | null, width: number | null, height: number | null } | null, price: { amount: string, currencyCode: CurrencyCode }, selectedOptions: Array<{ name: string, value: string }>, product: { handle: string, title: string } }, sellingPlanAllocation: { sellingPlan: { id: string, name: string } } | null }
        > } } | null, userErrors: Array<{ field: Array<string> | null, message: string, code: CartErrorCode | null }> } | null };

export type CartBuyerIdentityUpdateMutationVariables = Exact<{
  cartId: string | number;
  buyerIdentity: CartBuyerIdentityInput;
}>;


export type CartBuyerIdentityUpdateMutation = { cartBuyerIdentityUpdate: { cart: { id: string, checkoutUrl: string, totalQuantity: number, buyerIdentity: { countryCode: CountryCode | null }, cost: { subtotalAmount: { amount: string, currencyCode: CurrencyCode }, totalAmount: { amount: string, currencyCode: CurrencyCode }, totalTaxAmount: { amount: string, currencyCode: CurrencyCode } | null }, lines: { nodes: Array<
          | { id: string, quantity: number, cost: { totalAmount: { amount: string, currencyCode: CurrencyCode } }, merchandise: { id: string, title: string, availableForSale: boolean, image: { url: string, altText: string | null, width: number | null, height: number | null } | null, price: { amount: string, currencyCode: CurrencyCode }, selectedOptions: Array<{ name: string, value: string }>, product: { handle: string, title: string } }, sellingPlanAllocation: { sellingPlan: { id: string, name: string } } | null }
          | { id: string, quantity: number, cost: { totalAmount: { amount: string, currencyCode: CurrencyCode } }, merchandise: { id: string, title: string, availableForSale: boolean, image: { url: string, altText: string | null, width: number | null, height: number | null } | null, price: { amount: string, currencyCode: CurrencyCode }, selectedOptions: Array<{ name: string, value: string }>, product: { handle: string, title: string } }, sellingPlanAllocation: { sellingPlan: { id: string, name: string } } | null }
        > } } | null, userErrors: Array<{ field: Array<string> | null, message: string, code: CartErrorCode | null }> } | null };

export class TypedDocumentString<TResult, TVariables>
  extends String
  implements DocumentTypeDecoration<TResult, TVariables>
{
  __apiType?: NonNullable<DocumentTypeDecoration<TResult, TVariables>['__apiType']>;
  private value: string;
  public __meta__?: Record<string, any> | undefined;

  constructor(value: string, __meta__?: Record<string, any> | undefined) {
    super(value);
    this.value = value;
    this.__meta__ = __meta__;
  }

  override toString(): string & DocumentTypeDecoration<TResult, TVariables> {
    return this.value;
  }
}
export const CartFieldsFragmentDoc = new TypedDocumentString(`
    fragment CartFields on Cart {
  id
  checkoutUrl
  totalQuantity
  buyerIdentity {
    countryCode
  }
  cost {
    subtotalAmount {
      amount
      currencyCode
    }
    totalAmount {
      amount
      currencyCode
    }
    totalTaxAmount {
      amount
      currencyCode
    }
  }
  lines(first: 100) {
    nodes {
      id
      quantity
      cost {
        totalAmount {
          amount
          currencyCode
        }
      }
      merchandise {
        ... on ProductVariant {
          id
          title
          availableForSale
          image {
            url
            altText
            width
            height
          }
          price {
            amount
            currencyCode
          }
          selectedOptions {
            name
            value
          }
          product {
            handle
            title
          }
        }
      }
      sellingPlanAllocation {
        sellingPlan {
          id
          name
        }
      }
    }
  }
}
    `, {"fragmentName":"CartFields"}) as unknown as TypedDocumentString<CartFieldsFragment, unknown>;
export const CollectionProductsDocument = new TypedDocumentString(`
    query CollectionProducts($handle: String!, $first: Int!) {
  collection(handle: $handle) {
    id
    title
    description
    products(first: $first) {
      nodes {
        id
        handle
        title
        featuredImage {
          url
          altText
          width
          height
        }
        priceRange {
          minVariantPrice {
            amount
            currencyCode
          }
        }
      }
    }
  }
}
    `) as unknown as TypedDocumentString<CollectionProductsQuery, CollectionProductsQueryVariables>;
export const ProductByHandleDocument = new TypedDocumentString(`
    query ProductByHandle($handle: String!) {
  product(handle: $handle) {
    id
    handle
    title
    description
    vendor
    compareAtPriceRange {
      minVariantPrice {
        amount
        currencyCode
      }
    }
    featuredImage {
      url
      altText
      width
      height
    }
    images(first: 6) {
      nodes {
        url
        altText
        width
        height
      }
    }
    priceRange {
      minVariantPrice {
        amount
        currencyCode
      }
    }
    options {
      name
      optionValues {
        name
      }
    }
    sellingPlanGroups(first: 10) {
      nodes {
        name
        appName
        options {
          name
          values
        }
        sellingPlans(first: 20) {
          nodes {
            id
          }
        }
      }
    }
    variants(first: 100) {
      nodes {
        id
        title
        availableForSale
        selectedOptions {
          name
          value
        }
        price {
          amount
          currencyCode
        }
        compareAtPrice {
          amount
          currencyCode
        }
        image {
          url
          altText
          width
          height
        }
        sellingPlanAllocations(first: 10) {
          nodes {
            sellingPlan {
              id
              name
            }
            priceAdjustments {
              price {
                amount
                currencyCode
              }
            }
          }
        }
      }
    }
  }
}
    `) as unknown as TypedDocumentString<ProductByHandleQuery, ProductByHandleQueryVariables>;
export const ShopNameDocument = new TypedDocumentString(`
    query ShopName {
  shop {
    name
    primaryDomain {
      url
    }
  }
}
    `) as unknown as TypedDocumentString<ShopNameQuery, ShopNameQueryVariables>;
export const CartDocument = new TypedDocumentString(`
    query Cart($id: ID!) {
  cart(id: $id) {
    ...CartFields
  }
}
    fragment CartFields on Cart {
  id
  checkoutUrl
  totalQuantity
  buyerIdentity {
    countryCode
  }
  cost {
    subtotalAmount {
      amount
      currencyCode
    }
    totalAmount {
      amount
      currencyCode
    }
    totalTaxAmount {
      amount
      currencyCode
    }
  }
  lines(first: 100) {
    nodes {
      id
      quantity
      cost {
        totalAmount {
          amount
          currencyCode
        }
      }
      merchandise {
        ... on ProductVariant {
          id
          title
          availableForSale
          image {
            url
            altText
            width
            height
          }
          price {
            amount
            currencyCode
          }
          selectedOptions {
            name
            value
          }
          product {
            handle
            title
          }
        }
      }
      sellingPlanAllocation {
        sellingPlan {
          id
          name
        }
      }
    }
  }
}`) as unknown as TypedDocumentString<CartQuery, CartQueryVariables>;
export const CartCreateDocument = new TypedDocumentString(`
    mutation CartCreate($input: CartInput!) {
  cartCreate(input: $input) {
    cart {
      ...CartFields
    }
    userErrors {
      field
      message
      code
    }
  }
}
    fragment CartFields on Cart {
  id
  checkoutUrl
  totalQuantity
  buyerIdentity {
    countryCode
  }
  cost {
    subtotalAmount {
      amount
      currencyCode
    }
    totalAmount {
      amount
      currencyCode
    }
    totalTaxAmount {
      amount
      currencyCode
    }
  }
  lines(first: 100) {
    nodes {
      id
      quantity
      cost {
        totalAmount {
          amount
          currencyCode
        }
      }
      merchandise {
        ... on ProductVariant {
          id
          title
          availableForSale
          image {
            url
            altText
            width
            height
          }
          price {
            amount
            currencyCode
          }
          selectedOptions {
            name
            value
          }
          product {
            handle
            title
          }
        }
      }
      sellingPlanAllocation {
        sellingPlan {
          id
          name
        }
      }
    }
  }
}`) as unknown as TypedDocumentString<CartCreateMutation, CartCreateMutationVariables>;
export const CartLinesAddDocument = new TypedDocumentString(`
    mutation CartLinesAdd($cartId: ID!, $lines: [CartLineInput!]!) {
  cartLinesAdd(cartId: $cartId, lines: $lines) {
    cart {
      ...CartFields
    }
    userErrors {
      field
      message
      code
    }
  }
}
    fragment CartFields on Cart {
  id
  checkoutUrl
  totalQuantity
  buyerIdentity {
    countryCode
  }
  cost {
    subtotalAmount {
      amount
      currencyCode
    }
    totalAmount {
      amount
      currencyCode
    }
    totalTaxAmount {
      amount
      currencyCode
    }
  }
  lines(first: 100) {
    nodes {
      id
      quantity
      cost {
        totalAmount {
          amount
          currencyCode
        }
      }
      merchandise {
        ... on ProductVariant {
          id
          title
          availableForSale
          image {
            url
            altText
            width
            height
          }
          price {
            amount
            currencyCode
          }
          selectedOptions {
            name
            value
          }
          product {
            handle
            title
          }
        }
      }
      sellingPlanAllocation {
        sellingPlan {
          id
          name
        }
      }
    }
  }
}`) as unknown as TypedDocumentString<CartLinesAddMutation, CartLinesAddMutationVariables>;
export const CartLinesUpdateDocument = new TypedDocumentString(`
    mutation CartLinesUpdate($cartId: ID!, $lines: [CartLineUpdateInput!]!) {
  cartLinesUpdate(cartId: $cartId, lines: $lines) {
    cart {
      ...CartFields
    }
    userErrors {
      field
      message
      code
    }
  }
}
    fragment CartFields on Cart {
  id
  checkoutUrl
  totalQuantity
  buyerIdentity {
    countryCode
  }
  cost {
    subtotalAmount {
      amount
      currencyCode
    }
    totalAmount {
      amount
      currencyCode
    }
    totalTaxAmount {
      amount
      currencyCode
    }
  }
  lines(first: 100) {
    nodes {
      id
      quantity
      cost {
        totalAmount {
          amount
          currencyCode
        }
      }
      merchandise {
        ... on ProductVariant {
          id
          title
          availableForSale
          image {
            url
            altText
            width
            height
          }
          price {
            amount
            currencyCode
          }
          selectedOptions {
            name
            value
          }
          product {
            handle
            title
          }
        }
      }
      sellingPlanAllocation {
        sellingPlan {
          id
          name
        }
      }
    }
  }
}`) as unknown as TypedDocumentString<CartLinesUpdateMutation, CartLinesUpdateMutationVariables>;
export const CartLinesRemoveDocument = new TypedDocumentString(`
    mutation CartLinesRemove($cartId: ID!, $lineIds: [ID!]!) {
  cartLinesRemove(cartId: $cartId, lineIds: $lineIds) {
    cart {
      ...CartFields
    }
    userErrors {
      field
      message
      code
    }
  }
}
    fragment CartFields on Cart {
  id
  checkoutUrl
  totalQuantity
  buyerIdentity {
    countryCode
  }
  cost {
    subtotalAmount {
      amount
      currencyCode
    }
    totalAmount {
      amount
      currencyCode
    }
    totalTaxAmount {
      amount
      currencyCode
    }
  }
  lines(first: 100) {
    nodes {
      id
      quantity
      cost {
        totalAmount {
          amount
          currencyCode
        }
      }
      merchandise {
        ... on ProductVariant {
          id
          title
          availableForSale
          image {
            url
            altText
            width
            height
          }
          price {
            amount
            currencyCode
          }
          selectedOptions {
            name
            value
          }
          product {
            handle
            title
          }
        }
      }
      sellingPlanAllocation {
        sellingPlan {
          id
          name
        }
      }
    }
  }
}`) as unknown as TypedDocumentString<CartLinesRemoveMutation, CartLinesRemoveMutationVariables>;
export const CartBuyerIdentityUpdateDocument = new TypedDocumentString(`
    mutation CartBuyerIdentityUpdate($cartId: ID!, $buyerIdentity: CartBuyerIdentityInput!) {
  cartBuyerIdentityUpdate(cartId: $cartId, buyerIdentity: $buyerIdentity) {
    cart {
      ...CartFields
    }
    userErrors {
      field
      message
      code
    }
  }
}
    fragment CartFields on Cart {
  id
  checkoutUrl
  totalQuantity
  buyerIdentity {
    countryCode
  }
  cost {
    subtotalAmount {
      amount
      currencyCode
    }
    totalAmount {
      amount
      currencyCode
    }
    totalTaxAmount {
      amount
      currencyCode
    }
  }
  lines(first: 100) {
    nodes {
      id
      quantity
      cost {
        totalAmount {
          amount
          currencyCode
        }
      }
      merchandise {
        ... on ProductVariant {
          id
          title
          availableForSale
          image {
            url
            altText
            width
            height
          }
          price {
            amount
            currencyCode
          }
          selectedOptions {
            name
            value
          }
          product {
            handle
            title
          }
        }
      }
      sellingPlanAllocation {
        sellingPlan {
          id
          name
        }
      }
    }
  }
}`) as unknown as TypedDocumentString<CartBuyerIdentityUpdateMutation, CartBuyerIdentityUpdateMutationVariables>;