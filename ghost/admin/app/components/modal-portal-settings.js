import $ from 'jquery';
import ModalComponent from 'ghost-admin/components/modal-base';
import copyTextToClipboard from 'ghost-admin/utils/copy-text-to-clipboard';
import {action, computed} from '@ember/object';
import {htmlSafe} from '@ember/template';
import {inject as service} from '@ember/service';
import {task, timeout} from 'ember-concurrency';
const ICON_EXTENSIONS = ['gif', 'jpg', 'jpeg', 'png', 'svg'];

export default ModalComponent.extend({
    config: service(),
    membersUtils: service(),
    settings: service(),
    store: service(),

    page: 'signup',
    iconExtensions: null,
    isShowModalLink: true,
    customIcon: null,
    showLinksPage: false,
    showLeaveSettingsModal: false,
    freeSignupRedirect: undefined,
    paidSignupRedirect: undefined,
    prices: null,
    isPreloading: true,

    confirm() {},

    filteredPrices: computed('prices', 'settings.{portalPlans.[],membersMonthlyPriceId,membersYearlyPriceId}', function () {
        const monthlyPriceId = this.settings.get('membersMonthlyPriceId');
        const yearlyPriceId = this.settings.get('membersYearlyPriceId');
        const portalPlans = this.settings.get('portalPlans');
        const prices = this.prices || [];
        return prices.filter((d) => {
            return [monthlyPriceId, yearlyPriceId].includes(d.id);
        }).filter((d) => {
            return d.amount !== 0 && d.type === 'recurring';
        }).map((price) => {
            return {
                ...price,
                checked: !!portalPlans.find(d => d === price.id)
            };
        });
    }),

    hasPaidPriceChecked: computed('prices', 'settings.portalPlans.[]', function () {
        const portalPlans = this.settings.get('portalPlans');
        const prices = this.prices || [];
        return prices.filter((d) => {
            return d.amount !== 0 && d.type === 'recurring';
        }).some((price) => {
            return !!portalPlans.find(d => d === price.id);
        });
    }),

    backgroundStyle: computed('settings.accentColor', function () {
        let color = this.settings.get('accentColor') || '#ffffff';
        return htmlSafe(`background-color: ${color}`);
    }),

    showModalLinkOrAttribute: computed('isShowModalLink', function () {
        if (this.isShowModalLink) {
            return `#/portal`;
        }
        return `data-portal`;
    }),

    portalPreviewUrl: computed('page', 'membersUtils.{isFreeChecked,isMonthlyChecked,isYearlyChecked}', 'settings.{portalName,portalButton,portalButtonIcon,portalButtonSignupText,portalButtonStyle,accentColor,portalPlans.[]}', function () {
        const options = this.getProperties(['page']);
        return this.membersUtils.getPortalPreviewUrl(options);
    }),

    showIconSetting: computed('selectedButtonStyle', function () {
        const selectedButtonStyle = this.get('selectedButtonStyle.name') || '';
        return selectedButtonStyle.includes('icon');
    }),

    showButtonTextSetting: computed('selectedButtonStyle', function () {
        const selectedButtonStyle = this.get('selectedButtonStyle.name') || '';
        return selectedButtonStyle.includes('text');
    }),

    selectedButtonStyle: computed('settings.portalButtonStyle', function () {
        return this.buttonStyleOptions.find((buttonStyle) => {
            return (buttonStyle.name === this.settings.get('portalButtonStyle'));
        });
    }),

    init() {
        this._super(...arguments);
        this.buttonStyleOptions = [
            {name: 'icon-and-text', label: 'Icon and text'},
            {name: 'icon-only', label: 'Icon only'},
            {name: 'text-only', label: 'Text only'}
        ];
        this.iconExtensions = ICON_EXTENSIONS;
    },

    didInsertElement() {
        this._super(...arguments);
        this.settings.get('errors').clear();
    },

    actions: {
        toggleFreePlan(isChecked) {
            this.updateAllowedPlan('free', isChecked);
        },
        toggleMonthlyPlan(isChecked) {
            this.updateAllowedPlan('monthly', isChecked);
        },
        toggleYearlyPlan(isChecked) {
            this.updateAllowedPlan('yearly', isChecked);
        },
        togglePlan(priceId, event) {
            this.updateAllowedPlan(priceId, event.target.checked);
        },
        togglePortalButton(showButton) {
            this.settings.set('portalButton', showButton);
        },

        togglePortalName(showSignupName) {
            this.settings.set('portalName', showSignupName);
        },

        setPaidSignupRedirect(url) {
            this.set('paidSignupRedirect', url);
        },

        setFreeSignupRedirect(url) {
            this.set('freeSignupRedirect', url);
        },

        confirm() {
            return this.saveTask.perform();
        },

        isPlanSelected(plan) {
            const allowedPlans = this.settings.get('portalPlans');
            return allowedPlans.includes(plan);
        },

        switchPreviewPage(page) {
            if (page === 'links') {
                this.set('showLinksPage', true);
                this.set('page', '');
            } else {
                this.set('showLinksPage', false);
                this.set('page', page);
            }
        },

        switchToSignupPage() {
            if (this.showLinksPage) {
                this.set('showLinksPage', false);
                this.set('page', 'signup');
            }
        },

        setButtonStyle(buttonStyle) {
            this.settings.set('portalButtonStyle', buttonStyle.name);
        },
        setSignupButtonText(event) {
            this.settings.set('portalButtonSignupText', event.target.value);
        },
        /**
         * Fired after an image upload completes
         * @param  {string} property - Property name to be set on `this.settings`
         * @param  {UploadResult[]} results - Array of UploadResult objects
         * @return {string} The URL that was set on `this.settings.property`
         */
        imageUploaded(property, results) {
            if (results[0]) {
                this.set('customIcon', results[0].url);
                this.settings.set('portalButtonIcon', results[0].url);
            }
        },
        /**
         * Opens a file selection dialog - Triggered by "Upload Image" buttons,
         * searches for the hidden file input within the .gh-setting element
         * containing the clicked button then simulates a click
         * @param  {MouseEvent} event - MouseEvent fired by the button click
         */
        triggerFileDialog(event) {
            // simulate click to open file dialog
            // using jQuery because IE11 doesn't support MouseEvent
            $(event.target)
                .closest('.gh-setting-action')
                .find('input[type="file"]')
                .click();
        },

        deleteCustomIcon() {
            this.set('customIcon', null);
            this.settings.set('portalButtonIcon', this.membersUtils.defaultIconKeys[0]);
        },

        selectDefaultIcon(icon) {
            this.settings.set('portalButtonIcon', icon);
        },

        closeLeaveSettingsModal() {
            this.set('showLeaveSettingsModal', false);
        },

        openStripeSettings() {
            this.model.openStripeSettings();
            this.closeModal();
        },

        leaveSettings() {
            this.closeModal();
        },

        validateFreeSignupRedirect() {
            return this._validateSignupRedirect(this.get('freeSignupRedirect'), 'membersFreeSignupRedirect');
        },

        validatePaidSignupRedirect() {
            return this._validateSignupRedirect(this.get('paidSignupRedirect'), 'membersPaidSignupRedirect');
        }
    },

    updateAllowedPlan(plan, isChecked) {
        const portalPlans = this.settings.get('portalPlans') || [];
        const allowedPlans = [...portalPlans];

        if (!isChecked) {
            this.settings.set('portalPlans', allowedPlans.filter(p => p !== plan));
        } else {
            allowedPlans.push(plan);
            this.settings.set('portalPlans', allowedPlans);
        }
    },

    _validateSignupRedirect(url, type) {
        let errMessage = `Please enter a valid URL`;
        this.settings.get('errors').remove(type);
        this.settings.get('hasValidated').removeObject(type);

        if (url === null) {
            this.settings.get('errors').add(type, errMessage);
            this.settings.get('hasValidated').pushObject(type);
            return false;
        }

        if (url === undefined) {
            // Not initialised
            return;
        }

        if (url.href.startsWith(this.siteUrl)) {
            const path = url.href.replace(this.siteUrl, '');
            this.settings.set(type, path);
        } else {
            this.settings.set(type, url.href);
        }
    },

    finishPreloading: action(async function () {
        if (this.model.preloadTask?.isRunning) {
            await this.model.preloadTask;
        }

        const portalButtonIcon = this.settings.get('portalButtonIcon') || '';
        if (portalButtonIcon && !this.membersUtils.defaultIconKeys.includes(portalButtonIcon)) {
            this.set('customIcon', this.settings.get('portalButtonIcon'));
        }

        this.getAvailablePrices.perform();
        this.siteUrl = this.config.get('blogUrl');

        this.set('isPreloading', false);
    }),

    copyLinkOrAttribute: task(function* () {
        copyTextToClipboard(this.showModalLinkOrAttribute);
        yield timeout(this.isTesting ? 50 : 3000);
    }),

    saveTask: task(function* () {
        this.send('validateFreeSignupRedirect');
        this.send('validatePaidSignupRedirect');
        if (this.settings.get('errors').length !== 0) {
            return;
        }
        yield this.settings.save();
        this.closeModal();
    }).drop(),

    getAvailablePrices: task(function* () {
        const products = yield this.store.query('product', {include: 'stripe_prices'});
        const product = products.firstObject;
        const prices = product.get('stripePrices');
        const activePrices = prices.filter((d) => {
            return !!d.active;
        });
        this.set('prices', activePrices);
    }).drop()
});
