<script setup lang="ts">
import { BridgeHead } from '@swarakaka/bridge-vue'
import AppLayout from '@/Layouts/AppLayout.vue'
import CustomerForm from '@/Components/CustomerForm.vue'

defineOptions({ layout: AppLayout })
defineProps<{ statuses: string[] }>()
</script>

<template>
    <BridgeHead title="New customer · Bridge" />
    <h1 class="text-2xl font-semibold">New customer</h1>
    <div class="mt-6 max-w-lg">
        <CustomerForm
            :statuses="statuses"
            action="/customers"
            method="post"
            submit-label="Create customer"
        />
    </div>
</template>
