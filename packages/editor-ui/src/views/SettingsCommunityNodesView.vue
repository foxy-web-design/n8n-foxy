<script lang="ts">
import {
	COMMUNITY_PACKAGE_INSTALL_MODAL_KEY,
	COMMUNITY_NODES_INSTALLATION_DOCS_URL,
	COMMUNITY_NODES_NPM_INSTALLATION_URL,
} from '@/constants';
import CommunityPackageCard from '@/components/CommunityPackageCard.vue';
import { useToast } from '@/composables/useToast';
import type { PublicInstalledPackage } from 'n8n-workflow';

import { useCommunityNodesStore } from '@/stores/communityNodes.store';
import { useUIStore } from '@/stores/ui.store';
import { mapStores } from 'pinia';
import { useSettingsStore } from '@/stores/settings.store';
import { defineComponent } from 'vue';
import { useExternalHooks } from '@/composables/useExternalHooks';
import { useRouter } from 'vue-router';
import { usePushConnection } from '@/composables/usePushConnection';
import { usePushConnectionStore } from '@/stores/pushConnection.store';

const PACKAGE_COUNT_THRESHOLD = 31;

export default defineComponent({
	name: 'SettingsCommunityNodesView',
	components: {
		CommunityPackageCard,
	},
	setup() {
		const router = useRouter();
		const pushConnection = usePushConnection({ router });
		const externalHooks = useExternalHooks();

		return {
			externalHooks,
			...useToast(),
			pushConnection,
		};
	},
	data() {
		return {
			loading: false,
		};
	},
	computed: {
		...mapStores(useCommunityNodesStore, useSettingsStore, useUIStore, usePushConnectionStore),
		getEmptyStateDescription(): string {
			const packageCount = this.communityNodesStore.availablePackageCount;

			if (this.settingsStore.isDesktopDeployment) {
				return this.$locale.baseText('contextual.communityNodes.unavailable.description.desktop');
			}

			return packageCount < PACKAGE_COUNT_THRESHOLD
				? this.$locale.baseText('settings.communityNodes.empty.description.no-packages', {
						interpolate: {
							docURL: COMMUNITY_NODES_INSTALLATION_DOCS_URL,
						},
					})
				: this.$locale.baseText('settings.communityNodes.empty.description', {
						interpolate: {
							docURL: COMMUNITY_NODES_INSTALLATION_DOCS_URL,
							count: (Math.floor(packageCount / 10) * 10).toString(),
						},
					});
		},
		getEmptyStateButtonText(): string {
			if (this.settingsStore.isDesktopDeployment) {
				return this.$locale.baseText('contextual.communityNodes.unavailable.button.desktop');
			}

			return this.shouldShowInstallButton
				? this.$locale.baseText('settings.communityNodes.empty.installPackageLabel')
				: '';
		},
		shouldShowInstallButton(): boolean {
			return this.settingsStore.isDesktopDeployment || this.settingsStore.isNpmAvailable;
		},
		actionBoxConfig(): {
			calloutText: string;
			calloutTheme: 'warning' | string;
			hideButton: boolean;
		} {
			if (!this.settingsStore.isNpmAvailable) {
				return {
					calloutText: this.$locale.baseText('settings.communityNodes.npmUnavailable.warning', {
						interpolate: { npmUrl: COMMUNITY_NODES_NPM_INSTALLATION_URL },
					}),
					calloutTheme: 'warning',
					hideButton: true,
				};
			}

			return {
				calloutText: '',
				calloutTheme: '',
				hideButton: false,
			};
		},
	},
	beforeMount() {
		this.pushConnection.initialize();
		// The push connection is needed here to receive `reloadNodeType` and `removeNodeType` events when community nodes are installed, updated, or removed.
		this.pushStore.pushConnect();
	},
	async mounted() {
		try {
			this.loading = true;
			await this.communityNodesStore.fetchInstalledPackages();

			const installedPackages: PublicInstalledPackage[] =
				this.communityNodesStore.getInstalledPackages;
			const packagesToUpdate: PublicInstalledPackage[] = installedPackages.filter(
				(p) => p.updateAvailable,
			);
			this.$telemetry.track('user viewed cnr settings page', {
				num_of_packages_installed: installedPackages.length,
				installed_packages: installedPackages.map((p) => {
					return {
						package_name: p.packageName,
						package_version: p.installedVersion,
						package_nodes: p.installedNodes.map((node) => `${node.name}-v${node.latestVersion}`),
						is_update_available: p.updateAvailable !== undefined,
					};
				}),
				packages_to_update: packagesToUpdate.map((p) => {
					return {
						package_name: p.packageName,
						package_version_current: p.installedVersion,
						package_version_available: p.updateAvailable,
					};
				}),
				number_of_updates_available: packagesToUpdate.length,
			});
		} catch (error) {
			this.showError(
				error,
				this.$locale.baseText('settings.communityNodes.fetchError.title'),
				this.$locale.baseText('settings.communityNodes.fetchError.message'),
			);
		} finally {
			this.loading = false;
		}
		try {
			await this.communityNodesStore.fetchAvailableCommunityPackageCount();
		} finally {
			this.loading = false;
		}
	},
	beforeUnmount() {
		this.pushStore.pushDisconnect();
		this.pushConnection.terminate();
	},
	methods: {
		onClickEmptyStateButton(): void {
			if (this.settingsStore.isDesktopDeployment) {
				return this.goToUpgrade();
			}

			this.openInstallModal();
		},
		goToUpgrade(): void {
			void this.uiStore.goToUpgrade('community-nodes', 'upgrade-community-nodes');
		},
		openInstallModal(): void {
			const telemetryPayload = {
				is_empty_state: this.communityNodesStore.getInstalledPackages.length === 0,
			};
			this.$telemetry.track('user clicked cnr install button', telemetryPayload);

			void this.externalHooks.run('settingsCommunityNodesView.openInstallModal', telemetryPayload);
			this.uiStore.openModal(COMMUNITY_PACKAGE_INSTALL_MODAL_KEY);
		},
	},
});
</script>

<template>
	<div :class="$style.container">
		<div :class="$style.headingContainer">
			<n8n-heading size="2xlarge">{{ $locale.baseText('settings.communityNodes') }}</n8n-heading>
			<n8n-button
				v-if="communityNodesStore.getInstalledPackages.length > 0 && !loading"
				:label="$locale.baseText('settings.communityNodes.installModal.installButton.label')"
				size="large"
				@click="openInstallModal"
			/>
		</div>
		<div v-if="loading" :class="$style.cardsContainer">
			<CommunityPackageCard
				v-for="n in 2"
				:key="'index-' + n"
				:loading="true"
			></CommunityPackageCard>
		</div>
		<div
			v-else-if="communityNodesStore.getInstalledPackages.length === 0"
			:class="$style.actionBoxContainer"
		>
			<n8n-action-box
				:heading="$locale.baseText('settings.communityNodes.empty.title')"
				:description="getEmptyStateDescription"
				:button-text="getEmptyStateButtonText"
				:callout-text="actionBoxConfig.calloutText"
				:callout-theme="actionBoxConfig.calloutTheme"
				@click:button="onClickEmptyStateButton"
			/>
		</div>
		<div v-else :class="$style.cardsContainer">
			<CommunityPackageCard
				v-for="communityPackage in communityNodesStore.getInstalledPackages"
				:key="communityPackage.packageName"
				:community-package="communityPackage"
			></CommunityPackageCard>
		</div>
	</div>
</template>

<style lang="scss" module>
.container {
	height: 100%;
	padding-right: var(--spacing-2xs);
	> * {
		margin-bottom: var(--spacing-2xl);
	}
}

.headingContainer {
	display: flex;
	justify-content: space-between;
}

.loadingContainer {
	display: flex;
	gap: var(--spacing-xs);
}

.actionBoxContainer {
	text-align: center;
}

.cardsContainer {
	display: flex;
	flex-direction: column;
	gap: var(--spacing-2xs);
}
</style>
