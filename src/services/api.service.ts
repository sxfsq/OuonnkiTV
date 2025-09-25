import { API_CONFIG, PROXY_URL, M3U8_PATTERN } from '@/config/api.config'
import type { SearchResponse, DetailResponse, VideoItem, VideoApi } from '@/types'

class ApiService {
  private async fetchWithTimeout(
    url: string,
    options: RequestInit = {},
    timeout = 10000,
  ): Promise<Response> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      })
      clearTimeout(timeoutId)
      return response
    } catch (error) {
      clearTimeout(timeoutId)
      throw error
    }
  }

  // 搜索视频
  async searchVideos(query: string, api: VideoApi): Promise<SearchResponse> {
    try {
      if (!query) {
        throw new Error('缺少搜索参数')
      }

      if (!api || !api.url) {
        throw new Error('无效的API配置')
      }

      const apiUrl = `${api.url}${API_CONFIG.search.path}${encodeURIComponent(query)}`

      const response = await this.fetchWithTimeout(PROXY_URL + encodeURIComponent(apiUrl), {
        headers: API_CONFIG.search.headers,
      })

      if (!response.ok) {
        throw new Error(`API请求失败: ${response.status}`)
      }

      const data = await response.json()

      if (!data || !Array.isArray(data.list)) {
        throw new Error('API返回的数据格式无效')
      }

      // 添加源信息到每个结果
      data.list.forEach((item: VideoItem) => {
        item.source_name = api.name
        item.source_code = api.id
        item.api_url = api.url
      })

      return {
        code: 200,
        list: data.list || [],
      }
    } catch (error) {
      console.error('搜索错误:', error)
      return {
        code: 400,
        msg: error instanceof Error ? error.message : '请求处理失败',
        list: [],
      }
    }
  }

  // 获取视频详情
  async getVideoDetail(id: string, api: VideoApi): Promise<DetailResponse> {
    try {
      if (!id) {
        throw new Error('缺少视频ID参数')
      }

      // 验证ID格式
      if (!/^[\w-]+$/.test(id)) {
        throw new Error('无效的视频ID格式')
      }

      if (!api || !api.url) {
        throw new Error('无效的API配置')
      }

      // 使用 detailUrl 如果存在，否则使用 url
      const baseUrl = api.detailUrl || api.url
      const detailUrl = `${baseUrl}${API_CONFIG.detail.path}${id}`

      const response = await this.fetchWithTimeout(PROXY_URL + encodeURIComponent(detailUrl), {
        headers: API_CONFIG.detail.headers,
      })

      if (!response.ok) {
        throw new Error(`详情请求失败: ${response.status}`)
      }

      const data = await response.json()

      if (!data || !data.list || !Array.isArray(data.list) || data.list.length === 0) {
        throw new Error('获取到的详情内容无效')
      }

      const videoDetail = data.list[0]
      let episodes: string[] = []

      // 提取播放地址
      if (videoDetail.vod_play_url) {
        const playSources = videoDetail.vod_play_url.split('$$$')
        if (playSources.length > 0) {
          const mainSource = playSources[playSources.length - 1]
          const episodeList = mainSource.split('#')

          episodes = episodeList
            .map((ep: string) => {
              const parts = ep.split('$')
              return parts.length > 1 ? parts[1] : ''
            })
            .filter(
              (url: string) => url && (url.startsWith('http://') || url.startsWith('https://')),
            )
        }
      }

      // 如果没有找到播放地址，尝试使用正则表达式
      if (episodes.length === 0 && videoDetail.vod_content) {
        const matches = videoDetail.vod_content.match(M3U8_PATTERN) || []
        episodes = matches.map((link: string) => link.replace(/^\$/, ''))
      }

      return {
        code: 200,
        episodes,
        detailUrl,
        videoInfo: {
          title: videoDetail.vod_name,
          cover: videoDetail.vod_pic,
          desc: videoDetail.vod_content,
          type: videoDetail.type_name,
          year: videoDetail.vod_year,
          area: videoDetail.vod_area,
          director: videoDetail.vod_director,
          actor: videoDetail.vod_actor,
          remarks: videoDetail.vod_remarks,
          source_name: api.name,
          source_code: api.id,
        },
      }
    } catch (error) {
      console.error('详情获取错误:', error)
      return {
        code: 400,
        msg: error instanceof Error ? error.message : '请求处理失败',
        episodes: [],
      }
    }
  }

  // 并发控制辅助函数
  private createConcurrencyLimiter(limit: number) {
    let running = 0
    const queue: (() => void)[] = []

    const tryRun = () => {
      while (running < limit && queue.length > 0) {
        const next = queue.shift()
        if (next) {
          running++
          next()
        }
      }
    }

    return <T>(task: () => Promise<T>): Promise<T> => {
      return new Promise((resolve, reject) => {
        const run = () => {
          task()
            .then(resolve)
            .catch(reject)
            .finally(() => {
              running--
              tryRun()
            })
        }

        queue.push(run)
        tryRun()
      })
    }
  }

  // 聚合搜索（支持 AbortSignal、并发控制和增量渲染）
  aggregatedSearch(
    query: string,
    selectedAPIs: VideoApi[],
    onNewResults: (results: VideoItem[]) => void,
    signal?: AbortSignal,
  ): Promise<VideoItem[]> {
    if (selectedAPIs.length === 0) {
      console.warn('没有选中任何 API 源')
      return Promise.resolve([])
    }

    let aborted = false
    if (signal) {
      if (signal.aborted) {
        return Promise.reject(new DOMException('Aborted', 'AbortError'))
      }
      signal.addEventListener('abort', () => {
        aborted = true
      })
    }

    const seen = new Set<string>()
    const limiter = this.createConcurrencyLimiter(3)

    const tasks = selectedAPIs.map(api =>
      limiter(async () => {
        if (aborted) return [] as VideoItem[]
        let results: VideoItem[] = []
        try {
          results = await this.searchSingleSource(query, api)
        } catch (error) {
          if (aborted) return [] as VideoItem[]
          console.warn(`${api.name} 源搜索失败:`, error)
        }
        if (aborted) return [] as VideoItem[]

        const newUnique = results.filter(item => {
          const key = `${item.source_code}_${item.vod_id}`
          if (!seen.has(key)) {
            seen.add(key)
            return true
          }
          return false
        })
        if (aborted || newUnique.length === 0) return [] as VideoItem[]

        onNewResults(newUnique)
        return newUnique
      }),
    )

    const allPromise: Promise<VideoItem[]> = Promise.all(tasks).then(chunks => chunks.flat())
    if (signal) {
      const abortPromise = new Promise<VideoItem[]>((_, reject) => {
        signal.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'))
        })
      })
      return Promise.race([allPromise, abortPromise])
    }
    return allPromise
  }

  // 搜索单个源
  private async searchSingleSource(query: string, api: VideoApi): Promise<VideoItem[]> {
    try {
      const result = await this.searchVideos(query, api)
      if (result.code === 200 && result.list) {
        return result.list
      }
      return []
    } catch (error) {
      console.warn(`${api.name}源搜索失败:`, error)
      return []
    }
  }
}

export const apiService = new ApiService()
