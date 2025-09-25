import { useParams, useNavigate } from 'react-router'
import { useSearch } from '@/hooks'
import { apiService } from '@/services/api.service'
import { useState, useEffect, useRef, useMemo } from 'react'
import { type VideoItem } from '@/types'
import { useApiStore } from '@/store/apiStore'
import {
  Card,
  CardFooter,
  CardHeader,
  Chip,
  Image,
  addToast,
  Pagination,
  Skeleton,
} from '@heroui/react'
import { NoResultIcon } from '@/components/icons'
import { PaginationConfig } from '@/config/video.config'

export default function SearchResult() {
  const abortCtrlRef = useRef<AbortController | null>(null)
  const { videoAPIs } = useApiStore()
  const navigate = useNavigate()

  const { query } = useParams()
  const { search, setSearch, searchMovie } = useSearch()
  const [searchRes, setSearchRes] = useState<VideoItem[]>([])
  // 当前页码
  const [curPage, setCurPage] = useState(1)
  // 分页结果
  const paginationRes = useMemo(() => {
    const res = []
    for (let i = 0; i < searchRes.length; i += PaginationConfig.singlePageSize) {
      res.push(searchRes.slice(i, Math.min(i + PaginationConfig.singlePageSize, searchRes.length)))
    }
    return res || []
  }, [searchRes])
  // 加载控制
  const [loading, setLoading] = useState(true)
  // 接近底部浅色区域时反色分页
  const [invertPagination, setInvertPagination] = useState(false)
  // 筛选启用的视频源
  const selectedAPIs = useMemo(() => {
    return videoAPIs.filter(api => api.isEnabled)
  }, [videoAPIs])
  // 初始加载或路由参数变化时触发搜索
  useEffect(() => {
    if (query && search === '') {
      setLoading(true)
      setSearch(query)
      searchMovie(query, false)
    }
  }, [query, search, setSearch, searchMovie])
  // 监听搜索词或启用视频源变化时触发搜索
  useEffect(() => {
    setLoading(true)
    // 调用搜索内容
    const fetchSearchRes = async () => {
      if (!search) return
      // 取消上一次未完成的搜索
      abortCtrlRef.current?.abort()
      const controller = new AbortController()
      abortCtrlRef.current = controller
      setSearchRes([])
      const searchPromise = apiService
        .aggregatedSearch(
          search,
          selectedAPIs,
          newResults => {
            setSearchRes(prevResults => {
              const mergedRes = [...prevResults, ...newResults]
              if (mergedRes.length >= PaginationConfig.singlePageSize) setLoading(false)
              return mergedRes
            })
          },
          controller.signal,
        )
        .then(allResults => {
          addToast({
            title: '全部内容搜索完成！总计 ' + allResults.length + ' 条结果',
            radius: 'lg',
            color: 'success',
            timeout: 2000,
            classNames: {
              base: 'bg-white/60 backdrop-blur-lg border-0',
            },
          })
        })
        .catch(error => {
          if ((error as Error).name === 'AbortError') {
            console.error('搜索已取消:', error)
          } else {
            console.error('搜索时发生错误:', error)
          }
        })
        .finally(() => {
          setLoading(false)
        })

      addToast({
        title: '持续搜索内容中......',
        promise: searchPromise,
        radius: 'lg',
        timeout: 1,
        hideCloseButton: true,
        classNames: {
          base: 'bg-white/60 backdrop-blur-lg border-0',
        },
      })
    }
    if (search) {
      fetchSearchRes()
    }
  }, [search, selectedAPIs])

  // 组件卸载时取消未完成的搜索
  useEffect(() => {
    return () => {
      abortCtrlRef.current?.abort()
    }
  }, [])
  // 监听滚动位置变化以调整分页样式
  useEffect(() => {
    let timer: number | null = null
    const run = () => {
      const total = document.documentElement.scrollHeight
      const view = window.innerHeight
      if (total <= view + 8) {
        setInvertPagination(true)
        return
      }
      const remaining = total - ((window.scrollY || window.pageYOffset) + view)
      setInvertPagination(remaining < 50)
    }
    const debounced = () => {
      if (timer) window.clearTimeout(timer)
      timer = window.setTimeout(run, 80)
    }
    window.addEventListener('scroll', debounced, { passive: true })
    window.addEventListener('resize', debounced)
    run()
    return () => {
      if (timer) window.clearTimeout(timer)
      window.removeEventListener('scroll', debounced)
      window.removeEventListener('resize', debounced)
    }
  }, [paginationRes.length, curPage])

  const paginationTheme = invertPagination
    ? {
        base: 'bg-transparent transition-all',
        wrapper:
          'px-[1vw] h-[5vh] rounded-full  bg-white/5 backdrop-blur-xl backdrop-saturate-150 supports-[backdrop-filter:blur(0)]:bg-white/10 supports-not-[backdrop-filter:blur(0)]:bg-white/10',
        item: 'shadow-sm rounded-full bg-transparent text-black/80 data-[active=true]:text-black md:hover:cursor-pointer md:[&[data-hover=true]:not([data-active=true])]:!bg-black/10 [&[data-pressed=true]]:!bg-black/20',
        prev: 'rounded-full bg-transparent text-black/70 data-[disabled=true]:text-black/30 md:hover:cursor-pointer md:[&[data-hover=true]:not([data-active=true])]:!bg-black/10 [&[data-pressed=true]]:!bg-black/20',
        next: 'rounded-full bg-transparent text-black/70 data-[disabled=true]:text-black/30 md:hover:cursor-pointer md:[&[data-hover=true]:not([data-active=true])]:!bg-black/10 [&[data-pressed=true]]:!bg-black/20',
        cursor: 'rounded-full bg-black/70 text-white backdrop-blur-sm',
      }
    : {
        base: 'bg-transparent transition-all',
        wrapper:
          'px-[1vw] h-[5vh] rounded-full ring-1 ring-white/20 shadow-lg bg-white/10 backdrop-blur-xl backdrop-saturate-150 supports-[backdrop-filter:blur(0)]:bg-white/40 supports-not-[backdrop-filter:blur(0)]:bg-white/70',
        item: 'rounded-full bg-transparent text-white/90 data-[active=true]:text-white md:hover:cursor-pointer md:[&[data-hover=true]:not([data-active=true])]:!bg-black/20 [&[data-pressed=true]]:!bg-black/30',
        prev: 'rounded-full bg-transparent text-white/80 data-[disabled=true]:text-white/30 md:hover:cursor-pointer md:[&[data-hover=true]:not([data-active=true])]:!bg-black/20 [&[data-pressed=true]]:!bg-black/30',
        next: 'rounded-full bg-transparent text-white/80 data-[disabled=true]:text-white/30 md:hover:cursor-pointer md:[&[data-hover=true]:not([data-active=true])]:!bg-black/20 [&[data-pressed=true]]:!bg-black/30',
        cursor: 'rounded-full bg-black/60 backdrop-blur-sm',
      }

  // 处理卡片点击
  const handleCardClick = (item: VideoItem) => {
    // 导航到视频详情页，传递必要的参数
    navigate(`/detail/${item.source_code}/${item.vod_id}`, {
      state: { videoItem: item },
    })
  }

  // 处理切页
  const onPageChange = (page: number) => {
    setCurPage(page)
    window.scrollTo({ top: 0 })
  }

  return (
    <div className="p-4">
      {/* 搜索结果网格 */}
      {!loading && paginationRes[curPage - 1]?.length > 0 && (
        <div className="flex flex-col items-center gap-10">
          <div className="grid grid-cols-2 gap-[4vw] sm:grid-cols-3 md:gap-[2vw] xl:grid-cols-4">
            {paginationRes[curPage - 1]?.map((item: VideoItem, index: number) => (
              <Card
                key={`${item.source_code}_${item.vod_id}_${index}`}
                isPressable
                isFooterBlurred
                onPress={() => handleCardClick(item)}
                className="flex h-[27vh] w-full items-center border-none transition-transform hover:scale-103 lg:h-[35vh]"
                radius="lg"
              >
                <CardHeader className="absolute top-1 z-10 flex-col items-start p-3">
                  <div className="rounded-large bg-black/20 px-2 py-1 backdrop-blur">
                    <p className="text-tiny font-bold text-white/80 uppercase">
                      {item.source_name}
                    </p>
                  </div>
                  {item.vod_remarks && (
                    <Chip
                      size="sm"
                      color="warning"
                      variant="flat"
                      className="bg-warning/80 mt-2 backdrop-blur"
                    >
                      {item.vod_remarks}
                    </Chip>
                  )}
                </CardHeader>
                <Image
                  removeWrapper
                  isZoomed
                  isBlurred
                  loading="lazy"
                  alt={item.vod_name}
                  className="z-0 h-full w-full object-cover"
                  src={
                    item.vod_pic ||
                    'https://placehold.jp/30/ffffff/000000/300x450.png?text=暂无封面'
                  }
                />
                <CardFooter className="rounded-large shadow-small absolute bottom-[3%] z-10 min-h-[8vh] w-[92%] justify-between overflow-hidden border-1 border-white/20 py-2 backdrop-blur before:rounded-xl before:bg-white/10">
                  <div className="flex flex-grow flex-col gap-1 px-1">
                    <p className="text-tiny text-white/80">
                      {item.type_name} · {item.vod_year}
                    </p>
                    <p className="line-clamp-2 text-sm font-semibold text-white">{item.vod_name}</p>
                  </div>
                </CardFooter>
              </Card>
            ))}
          </div>
          <div className="sticky bottom-[2vh] z-50 flex justify-center transition-all">
            <Pagination
              classNames={paginationTheme}
              onChange={onPageChange}
              showControls
              size={window.innerWidth < 640 ? 'sm' : 'lg'}
              initialPage={1}
              total={paginationRes.length}
            />
          </div>
        </div>
      )}

      {/* 加载中 */}
      {loading && (
        <div className="grid grid-cols-2 gap-[4vw] sm:grid-cols-3 md:gap-[2vw] xl:grid-cols-4">
          {new Array(PaginationConfig.singlePageSize).fill(null).map((_, index: number) => (
            <Card
              key={index}
              isPressable
              isFooterBlurred
              className="flex h-[27vh] w-full items-center border-none transition-transform hover:scale-103 lg:h-[35vh]"
              radius="lg"
            >
              <Skeleton className="mt-[5%] h-[59%] w-[90%] rounded-lg md:h-[66%]" />
              <CardFooter className="shadow-small absolute bottom-[4%] z-10 min-h-[8vh] w-[90%] justify-between overflow-hidden rounded-lg border-1 border-white/20 py-2 backdrop-blur before:rounded-xl before:bg-white/10">
                <div className="flex flex-grow flex-col gap-3 px-1">
                  <Skeleton className="h-4 w-full rounded-lg md:h-5 md:w-[40%]" />
                  <Skeleton className="h-4 w-full rounded-lg md:h-5 md:w-[60%]" />
                </div>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      {/* 无结果提示 */}
      {!loading && searchRes?.length === 0 && (
        <div className="flex flex-col items-center py-20">
          <NoResultIcon size={200}></NoResultIcon>
          <p className="text-gray-500">没有找到相关内容，试试别的关键词吧~</p>
        </div>
      )}
    </div>
  )
}
