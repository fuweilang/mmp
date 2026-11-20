<template>
  <section class="knowledge-services">
    <header class="service-heading">
      <div>
        <h1>检索服务</h1>
        <p>配置知识文件处理和专家检索所用的服务。实际检索效果请在专家调试中验证。</p>
      </div>
    </header>
    <KnowledgeCoreAdmin settings-only service-only />
  </section>
</template>
<script setup lang="ts">
import KnowledgeCoreAdmin from '../../components/admin/KnowledgeCoreAdmin.vue';
</script>
<style>
.workspace:has(> .knowledge-services) {
  display: flex;
  flex-direction: column;
  padding: 15px;
}
</style>
<style scoped>
.knowledge-services {
  background: #fff;
  box-sizing: border-box;
  flex: 1 1 auto;
  min-height: 100%;
  padding: 20px 24px 24px;
}
.service-heading {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 20px;
  margin-bottom: 20px;
}
.service-heading h1 {
  margin: 0 0 8px;
  font-size: 20px;
  font-weight: 600;
  color: #333946;
}
.service-heading p {
  margin: 0;
  color: #667085;
  font-size: 13px;
  line-height: 1.7;
}
</style>
