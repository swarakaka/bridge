<script setup lang="ts">
import { BridgeHead } from '@swarakaka/bridge-vue'
import AppLayout from '@/Layouts/AppLayout.vue'
import CustomerForm from '@/Components/CustomerForm.vue'
import type { Customer } from '@/types'

defineOptions({ layout: AppLayout })
defineProps<{ customer: Customer; statuses: string[] }>()
</script>

<template>
    <BridgeHead :title="`Edit ${customer.name} · Bridge`" />
    <h1 class="text-2xl font-semibold">Edit {{ customer.name }}</h1>
    <div class="mt-6 max-w-lg">
        <CustomerForm
            :customer="customer"
            :statuses="statuses"
            :action="`/customers/${customer.id}`"
            method="put"
            submit-label="Save changes"
        />
    </div>
</template>
