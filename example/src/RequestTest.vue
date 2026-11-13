<script setup>
import { ref } from "vue"
import { useListFetch, useListFetchAll, useViewFetch, useAddFetch, useEditFetch, useDeleteFetch } from "viur-ui"

// ── List (paginated) ──────────────────────────────────────────────────────────
const list = useListFetch("user", { params: { limit: 5 } })

// ── List All (all pages automatically) ───────────────────────────────────────
const listAll = useListFetchAll("user", { params: { limit: 5 } })

// ── View ──────────────────────────────────────────────────────────────────────
const viewKey = ref("")
let viewInstance = null
const viewData = ref(null)
const viewFetching = ref(false)
const viewFinished = ref(false)

function runView() {
  viewInstance = useViewFetch("user", "/", { key: viewKey.value })
  viewData.value = viewInstance.data
  viewFetching.value = viewInstance.isFetching
  viewFinished.value = viewInstance.isFinished
}

// ── Add ───────────────────────────────────────────────────────────────────────
const addName = ref("")
const addEmail = ref("")
let addInstance = null
const addData = ref(null)

function runAdd() {
  addInstance = useAddFetch("user", "/", { name: addName.value, email: addEmail.value })
  addData.value = addInstance.data
}

// ── Edit ──────────────────────────────────────────────────────────────────────
const editKey = ref("")
const editName = ref("")
let editInstance = null
const editData = ref(null)

function runEdit() {
  editInstance = useEditFetch("user", "/", { key: editKey.value, name: editName.value })
  editData.value = editInstance.data
}

// ── Delete ────────────────────────────────────────────────────────────────────
const deleteKey = ref("")
let deleteInstance = null
const deleteData = ref(null)

function runDelete() {
  deleteInstance = useDeleteFetch("user", "/", { key: deleteKey.value })
  deleteData.value = deleteInstance.data
}
</script>

<template>
  <div
    style="font-family: monospace; max-width: 960px; padding: 1rem; display: flex; flex-direction: column; gap: 2rem"
  >
    <!-- useListFetch -->
    <section>
      <h3>useListFetch("user") — paginiert</h3>
      <div style="display: flex; gap: 0.5rem; margin-bottom: 0.5rem">
        <button @click="list.execute()">execute()</button>
        <button
          :disabled="!list.isFinished.value || !list.data.value?.length"
          @click="list.next()"
        >
          next()
        </button>
        <button @click="list.reset()">reset()</button>
      </div>
      <p>
        isFetching: {{ list.isFetching }} | isFinished: {{ list.isFinished }} | einträge:
        {{ list.data.value?.length ?? 0 }}
      </p>
      <table
        v-if="list.data.value?.length"
        border="1"
        cellpadding="4"
        style="border-collapse: collapse; width: 100%"
      >
        <thead>
          <tr>
            <th>key</th>
            <th>name</th>
            <th>email</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in list.data.value"
            :key="row.key"
          >
            <td style="font-size: 0.8em">{{ row.key }}</td>
            <td>{{ row.name }}</td>
            <td>{{ row.email }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <!-- useListFetchAll -->
    <section>
      <h3>useListFetchAll("user") — alle Seiten automatisch</h3>
      <div style="display: flex; gap: 0.5rem; margin-bottom: 0.5rem">
        <button @click="listAll.execute()">execute()</button>
        <button @click="listAll.reset()">reset()</button>
      </div>
      <p>
        isFetching: {{ listAll.isFetching }} | isFinished: {{ listAll.isFinished }} | einträge:
        {{ listAll.data.value?.length ?? 0 }}
      </p>
    </section>

    <!-- useViewFetch -->
    <section>
      <h3>useViewFetch("user")</h3>
      <div style="display: flex; gap: 0.5rem; margin-bottom: 0.5rem">
        <input
          v-model="viewKey"
          placeholder="User-Key"
          style="flex: 1"
        />
        <button
          :disabled="!viewKey"
          @click="runView"
        >
          view()
        </button>
      </div>
      <pre
        v-if="viewData?.value"
        style="background: #f4f4f4; padding: 0.5rem; overflow: auto; max-height: 200px"
        >{{ JSON.stringify(viewData.value?.values ?? viewData.value, null, 2) }}</pre>
    </section>

    <!-- useAddFetch -->
    <section>
      <h3>useAddFetch("user")</h3>
      <div style="display: flex; gap: 0.5rem; margin-bottom: 0.5rem">
        <input
          v-model="addName"
          placeholder="Name"
          style="flex: 1"
        />
        <input
          v-model="addEmail"
          placeholder="E-Mail"
          style="flex: 1"
        />
        <button @click="runAdd">add()</button>
      </div>
      <pre
        v-if="addData?.value"
        style="background: #f4f4f4; padding: 0.5rem; overflow: auto; max-height: 200px"
        >{{ JSON.stringify(addData.value, null, 2) }}</pre>
    </section>

    <!-- useEditFetch -->
    <section>
      <h3>useEditFetch("user")</h3>
      <div style="display: flex; gap: 0.5rem; margin-bottom: 0.5rem">
        <input
          v-model="editKey"
          placeholder="User-Key"
          style="flex: 1"
        />
        <input
          v-model="editName"
          placeholder="Neuer Name"
          style="flex: 1"
        />
        <button
          :disabled="!editKey"
          @click="runEdit"
        >
          edit()
        </button>
      </div>
      <pre
        v-if="editData?.value"
        style="background: #f4f4f4; padding: 0.5rem; overflow: auto; max-height: 200px"
        >{{ JSON.stringify(editData.value, null, 2) }}</pre>
    </section>

    <!-- useDeleteFetch -->
    <section>
      <h3>useDeleteFetch("user")</h3>
      <div style="display: flex; gap: 0.5rem; margin-bottom: 0.5rem">
        <input
          v-model="deleteKey"
          placeholder="User-Key"
          style="flex: 1"
        />
        <button
          :disabled="!deleteKey"
          @click="runDelete"
        >
          delete()
        </button>
      </div>
      <pre
        v-if="deleteData?.value"
        style="background: #f4f4f4; padding: 0.5rem; overflow: auto; max-height: 200px"
        >{{ JSON.stringify(deleteData.value, null, 2) }}</pre>
    </section>
  </div>
</template>
