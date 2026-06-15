<script setup lang="ts">
const { data: page } = await useAsyncData('about', () => {
  return queryCollection('about').first()
})
if (!page.value) {
  throw createError({
    statusCode: 404,
    statusMessage: 'Page not found',
    fatal: true
  })
}

const { global } = useAppConfig()

const title = page.value?.seo?.title || page.value?.title
const description = page.value?.seo?.description || page.value?.description

useSeoMeta({
  title,
  ogTitle: title,
  description,
  ogDescription: description
})

defineOgImage('Portfolio', { title, description })
</script>

<template>
  <UPage v-if="page">
    <UPageHero
      :title="page.title"
      :description="page.description"
      orientation="horizontal"
      :ui="{
        container: 'lg:flex sm:flex-row items-center',
        title: 'mx-0! text-left',
        description: 'mx-0! text-left',
        links: 'justify-start'
      }"
    >
      <UColorModeAvatar
        class="sm:rotate-4 size-36 rounded-lg ring ring-default ring-offset-3 ring-offset-bg"
        :light="global.picture?.light!"
        :dark="global.picture?.dark!"
        :alt="global.picture?.alt!"
      />
    </UPageHero>
    <div class="w-full max-w-(--ui-container) mx-auto px-4 sm:px-8 lg:px-16 pb-16">
      <MDC
        :value="page.content"
        unwrap="p"
      />
      <div v-if="page.skills?.length" class="mt-8">
        <h3 class="text-xl font-bold mb-4">技術棧</h3>
        <div class="flex flex-wrap gap-3">
          <div
            v-for="skill in page.skills"
            :key="skill.name"
            class="flex items-center gap-2 px-3 py-2 rounded-lg border border-default bg-elevated text-sm"
          >
            <UIcon :name="skill.icon" class="size-4 shrink-0" />
            <span>{{ skill.name }}</span>
          </div>
        </div>
      </div>
    </div>
  </UPage>
</template>
