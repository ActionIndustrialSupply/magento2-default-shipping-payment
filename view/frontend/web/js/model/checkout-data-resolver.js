define([
    'underscore',
    'mage/utils/wrapper',
    'Magento_Checkout/js/checkout-data',
    'Magento_Checkout/js/model/payment-service',
    'Magento_Checkout/js/action/select-shipping-method',
    'Magento_Checkout/js/action/select-payment-method'
], function (_, wrapper, checkoutData, paymentService, selectShippingMethodAction, selectPaymentMethodAction) {
    'use strict';

    return function (checkoutDataResolver) {
        var config = window.checkoutConfig;

        /**
         * Safe timing fix: defer execution until Knockout finishes updating rates.
         * Works in 2.4.6 and 2.4.8 without new dependencies.
         */
        var resolveShippingRates = wrapper.wrap(
            checkoutDataResolver.resolveShippingRates,
            function (originalResolveShippingRates, ratesData) {
                var result = originalResolveShippingRates(ratesData);

                // Only auto-select if user hasn't picked anything yet
                if (!checkoutData.getSelectedShippingRate()) {
                    _.defer(function () {
                        // Use the updated ratesData array passed into resolver
                        var availableRates = ratesData || [];
                        if (availableRates.length > 0) {
                            var method = checkoutDataResolver.getMethod('shipping', availableRates);
                            if (method) {
                                selectShippingMethodAction(method);
                            }
                        } else {
                            console.warn('[HS DefaultShippingPayment] No shipping rates available at defer time.');
                        }
                    });
                }

                return result;
            }
        );

        /**
         * Payment method resolution — same logic, stable and safe.
         */
        var resolvePaymentMethod = wrapper.wrap(
            checkoutDataResolver.resolvePaymentMethod,
            function (originalResolvePaymentMethod) {
                var result = originalResolvePaymentMethod();

                var availablePaymentMethods = paymentService.getAvailablePaymentMethods();
                if (!checkoutData.getSelectedPaymentMethod() && availablePaymentMethods.length > 0) {
                    var method = checkoutDataResolver.getMethod('payment', availablePaymentMethods);
                    if (method) {
                        selectPaymentMethodAction(method);
                    }
                }

                return result;
            }
        );

        return _.extend(checkoutDataResolver, {
            resolveShippingRates: resolveShippingRates,
            resolvePaymentMethod: resolvePaymentMethod,

            getMethod: function (type, availableMethods) {
                var autoselectMethod = this.getMethodBySelectionType(type, 'autoselect'),
                    matchedMethod,
                    self = this;

                if (autoselectMethod) {
                    matchedMethod = availableMethods.find(function (method) {
                        return self.getMethodCode(method, type) === autoselectMethod;
                    });
                }

                if (!matchedMethod) {
                    var fallbackMethod = this.getMethodBySelectionType(type, 'fallback');
                    if (fallbackMethod === 'first') {
                        matchedMethod = availableMethods[0];
                    } else if (fallbackMethod === 'last') {
                        matchedMethod = availableMethods[availableMethods.length - 1];
                    } else if (fallbackMethod === 'lowest_price') {
                        matchedMethod = _.min(availableMethods, function (method) {
                            return method.amount;
                        });
                    }
                }

                return matchedMethod;
            },

            getMethodBySelectionType: function (methodType, selectionType) {
                if (
                    config.hsDefaultShippingPayment &&
                    config.hsDefaultShippingPayment[methodType]
                ) {
                    return config.hsDefaultShippingPayment[methodType][selectionType];
                }
            },

            getMethodCode: function (method, type) {
                return type === 'shipping'
                    ? method.carrier_code + '_' + method.method_code
                    : method.method;
            }
        });
    };
});
