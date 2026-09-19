/** Category management's public surface: what routes may import. */
export { CategoryEditor } from './components/CategoryEditor';
export { CategoryList } from './components/CategoryList';
export { createCategory, deleteCategory, getCategory, mergeCategory, updateCategory } from './data/actions';
export { useCategoriesWithUsage, useCategoriesWithUsageResult } from './data/hooks';
export type { CategoryWithUsage } from './data/sql';
export { MAX_CATEGORY_NAME, type CategoryInput } from './data/writes';
