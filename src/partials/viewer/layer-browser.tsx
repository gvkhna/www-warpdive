import {Any} from '@/generated/google/protobuf/any_pb'
import {WarpDiveImage, WarpDiveImage_TreeNode} from '@/generated/warpdive_pb'
import {useWarpImage} from './warp-dive-image-provider'

import {ResizableHandle, ResizablePanel, ResizablePanelGroup} from '@/components/ui/resizable'
import {useState, useEffect, type FC, useCallback} from 'react'
import {LayerRow} from './layer-row'
import {LayersList} from './layers-list'
import {ScrollArea} from '@/components/ui/scroll-area'
import {Timestamp} from '@/generated/google/protobuf/timestamp_pb'
import {FileSystemViewer} from './file-system-viewer'
import {useLayer} from './use-layer'
import {FileSystemViewerToolbar} from './file-system-viewer-toolbar'
import {MobileLayersList} from './mobile-layers-list'
import {layerUiStateAtom, type TreeNodeMap} from './use-layer-ui-state'
import {useAtom} from 'jotai'
import {LayerListToolbar} from './layer-list-toolbar'

export interface LayerBrowserProps {
  binary: Uint8Array
  onError: (e: Error) => void
  fullPage?: boolean
  appViewer?: boolean
  pid?: string
}

export const LayerBrowser: FC<LayerBrowserProps> = ({binary, onError, fullPage = false, appViewer = false, pid}) => {
  const {wpImage, setWpImage} = useWarpImage()
  const [isLoading, setLoading] = useState(false)
  const [layerState, setLayerState] = useLayer()
  const [, setLayerMap] = useAtom(layerUiStateAtom)

  // Function to get layers from the first root node
  const getLayersFromRoot = (): WarpDiveImage_TreeNode[] => {
    // Ensure wpImage and wpImage.tree exist and have the needed properties
    if (!wpImage || !wpImage.tree || !wpImage.tree.children || wpImage.tree.children.length === 0) {
      return []
    }
    return wpImage.tree.children
  }

  const collectNodesToDepth = useCallback((node: WarpDiveImage_TreeNode | undefined, currentDepth = 1) => {
    const MAX_DEPTH = 4
    let nodes: string[] = []

    if (!node || currentDepth > MAX_DEPTH) {
      return nodes
    }

    if (node.ref?.gid) {
      nodes.push(node.ref.gid)
    }

    if (node.children && currentDepth < MAX_DEPTH) {
      node.children.forEach((child) => {
        nodes = nodes.concat(collectNodesToDepth(child, currentDepth + 1))
      })
    }

    return nodes
  }, [])

  const layers = getLayersFromRoot()

  // console.log('root layers: ', layers)

  useEffect(() => {
    function processBinary() {
      if (!binary) return
      setLoading(true)
      try {
        const anyPb = Any.fromBinary(binary, {})
        if (Any.contains(anyPb, WarpDiveImage)) {
          const wpImageRead = Any.unpack(anyPb, WarpDiveImage)
          console.log(wpImageRead.tree)
          console.log(wpImageRead.nodes)
          console.log(wpImageRead.metadata)
          if (wpImageRead.metadata?.ts) {
            const d = Timestamp.toDate(wpImageRead.metadata?.ts)
            // console.log(d.toString())
          }
          setWpImage(wpImageRead)
        }
      } catch (err) {
        console.log('Error parsing file:', err)
        onError(new Error('Failed to load binary. The file is not a valid `.warpdive` binary.'))
      } finally {
        setLoading(false)
      }
    }

    processBinary()
  }, [binary, setWpImage, onError])

  useEffect(() => {
    if (layers.length > 0 && layerState.selectedLayer === null) {
      const firstLayer = layers[0]
      setLayerState({
        selectedLayer: firstLayer
      })
      // set initial state of ui open/collapsed dirs
      if (wpImage) {
        const gids = collectNodesToDepth(wpImage.tree)

        const initialLayerMap: TreeNodeMap = new Map()

        layers.map((layer) => {
          const treeNodeGid = layer.ref?.gid
          if (treeNodeGid) {
            // console.log('setting default layer', treeNodeGid, gids)

            initialLayerMap.set(treeNodeGid, gids)
          }
        })
        setLayerMap(initialLayerMap)
      }
    }
  }, [layerState.selectedLayer, layers, setLayerState, setLayerMap, wpImage, collectNodesToDepth])

  if (isLoading) {
    return <div>Loading...</div>
  }

  if (!wpImage) {
    return <div>Unknown Error</div>
  }

  // Function to get a node by gid
  const getNodeByGid = (gid: number) => {
    return wpImage ? wpImage.nodes[gid] : undefined
  }

  return (
    <>
      <div className={`${fullPage ? 'h-[calc(100vh)]' : 'h-[calc(100vh_-_theme(spacing.16))]'} w-full md:hidden`}>
        <MobileLayersList>
          <LayersList>
            {layers.map(
              (layer) =>
                layer.ref?.gid && (
                  <LayerRow
                    key={layer.ref.gid}
                    treeNode={layer}
                  />
                )
            )}
          </LayersList>
        </MobileLayersList>
        <FileSystemViewer />
      </div>
      <div className={`hidden ${fullPage ? 'h-[calc(100vh)]' : 'h-[calc(100vh_-_theme(spacing.16))]'} w-full md:flex`}>
        <ResizablePanelGroup direction='horizontal'>
          <ResizablePanel
            minSize={20}
            defaultSize={40}
          >
            <div className=' dark:border-gray-800 dark:bg-gray-950 bg-white'>
              {appViewer && (
                <LayerListToolbar
                  appViewer={appViewer}
                  pid={pid}
                />
              )}

              <ScrollArea className={`${fullPage ? 'h-[calc(100vh)]' : 'h-[calc(100vh_-_theme(spacing.16))]'}`}>
                <LayersList>
                  {layers.map(
                    (layer) =>
                      layer.ref?.gid && (
                        <LayerRow
                          key={layer.ref.gid}
                          treeNode={layer}
                        />
                      )
                  )}
                </LayersList>
              </ScrollArea>
            </div>
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel minSize={20}>
            <FileSystemViewerToolbar />
            <FileSystemViewer />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </>
  )
}
