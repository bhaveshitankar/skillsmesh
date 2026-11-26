export async function upsertSkillVector(
  index: VectorizeIndex,
  skillId: string,
  vector: number[],
  metadata: Record<string, string>,
): Promise<void> {
  await index.upsert([{ id: skillId, values: vector, metadata }])
}

export async function searchSkills(
  index: VectorizeIndex,
  queryVector: number[],
  topK = 5,
): Promise<VectorizeMatch[]> {
  const result = await index.query(queryVector, { topK, returnMetadata: 'all' })
  return result.matches ?? []
}

export async function deleteSkillVector(
  index: VectorizeIndex,
  skillId: string,
): Promise<void> {
  await index.deleteByIds([skillId])
}
