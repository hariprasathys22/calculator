import vtkRenderWindow from "@kitware/vtk.js/Rendering/Core/RenderWindow";
import vtkRenderer from "@kitware/vtk.js/Rendering/Core/Renderer";
import vtkRenderWindowInteractor from "@kitware/vtk.js/Rendering/Core/RenderWindowInteractor";
import vtkPolyData from "@kitware/vtk.js/Common/DataModel/PolyData";
import vtkMapper from "@kitware/vtk.js/Rendering/Core/Mapper";
import vtkActor from "@kitware/vtk.js/Rendering/Core/Actor";
import vtkDataArray from "@kitware/vtk.js/Common/Core/DataArray";
import vtkInteractorStyleTrackballCamera from "@kitware/vtk.js/Interaction/Style/InteractorStyleTrackballCamera";
import vtkColorTransferFunction from "@kitware/vtk.js/Rendering/Core/ColorTransferFunction";
import vtkWindowedSincPolyDataFilter from "@kitware/vtk.js/Filters/General/WindowedSincPolyDataFilter";

/**

@file createVTUViewer.js
This module provides a reusable function for rendering VTU files using VTK.js.
It includes functionality for scalar fields, thresholding, color mapping, and more.
Installation
bash
Copy code
npm install your-package-name
Copy code
Usage
javascript
Copy code
import createVTUViewer from 'your-package-name';
const container = document.getElementById('viewer-container');
const viewer = createVTUViewer(container);
const file = new File([/* your VTU file ], 'example.vtu');
viewer.addVTUToScene(file).then(({ scalarFields }) => {
    console.log('Available Scalars:', scalarFields);
    });
    // Adjust settings dynamically
    viewer.setRepresentation(actor, 'surface_with_edges');
    viewer.enableThreshold(actor, 0.5);
    Copy code
    API
    addVTUToScene(file, options): Promise<{ polyData, actor, scalarFields }>
    setRepresentation(actor, type): void
    enableThreshold(actor, thresholdValue): void
    dispose(): void */

const createVTUViewer = (container, options = {}) => {
  const renderer = vtkRenderer.newInstance({ background: [1, 1, 1] });
  const renderWindow = vtkRenderWindow.newInstance();
  renderWindow.addRenderer(renderer);

  const openGLRenderWindow = renderWindow.newAPISpecificView();
  openGLRenderWindow.setContainer(container);
  renderWindow.addView(openGLRenderWindow);

  const interactor = vtkRenderWindowInteractor.newInstance();
  interactor.setView(openGLRenderWindow);
  interactor.initialize();
  interactor.bindEvents(container);

  const interactorStyle = vtkInteractorStyleTrackballCamera.newInstance();
  interactor.setInteractorStyle(interactorStyle);

  const resizeRenderer = () => {
    const { clientWidth, clientHeight } = container;
    openGLRenderWindow.setSize(clientWidth, clientHeight);
    renderer.resetCamera();
    renderWindow.render();
  };

  window.addEventListener("resize", resizeRenderer);
  resizeRenderer();

  const getAllScalarFields = (xmlDoc) => {
    const scalarArrays = xmlDoc.querySelectorAll("PointData DataArray");
    return Array.from(scalarArrays).map((array) => array.getAttribute("Name"));
  };

  const extractPoints = (xmlDoc) => {
    const pointsTag = xmlDoc.querySelector("Points DataArray");
    const pointsText = pointsTag.textContent.trim();
    const pointsArray = pointsText.split(/\s+/).map(Number);
    return new Float32Array(pointsArray);
  };

  const extractCells = (xmlDoc) => {
    const connectivityTag = xmlDoc.querySelector('Cells DataArray[Name="connectivity"]');
    const offsetsTag = xmlDoc.querySelector('Cells DataArray[Name="offsets"]');
    const typesTag = xmlDoc.querySelector('Cells DataArray[Name="types"]');

    if (!connectivityTag || !offsetsTag || !typesTag) {
      throw new Error("Missing required cell data in the VTU file.");
    }

    const connectivityArray = connectivityTag.textContent.trim().split(/\s+/).map(Number);
    const offsetsArray = offsetsTag.textContent.trim().split(/\s+/).map(Number);
    const typesArray = typesTag.textContent.trim().split(/\s+/).map(Number);

    const VTK_TRIANGLE = 5;
    const VTK_QUAD = 9;
    const VTK_TETRA = 10;
    const VTK_HEXAHEDRON = 12;
    const VTK_WEDGE = 13;
    const VTK_PYRAMID = 14;

    let cells = [];
    let previousOffset = 0;

    for (let i = 0; i < typesArray.length; i++) {
      const cellType = typesArray[i];
      const numPoints = offsetsArray[i] - previousOffset;
      const cellIndices = connectivityArray.slice(previousOffset, offsetsArray[i]);

      switch (cellType) {
        case VTK_TRIANGLE:
          cells.push(3, ...cellIndices);
          break;
        case VTK_QUAD:
          cells.push(
            3,
            cellIndices[0],
            cellIndices[1],
            cellIndices[2],
            3,
            cellIndices[0],
            cellIndices[2],
            cellIndices[3]
          );
          break;
        case VTK_TETRA:
          cells.push(
            3,
            cellIndices[0],
            cellIndices[1],
            cellIndices[2],
            3,
            cellIndices[0],
            cellIndices[2],
            cellIndices[3],
            3,
            cellIndices[0],
            cellIndices[3],
            cellIndices[1],
            3,
            cellIndices[1],
            cellIndices[3],
            cellIndices[2]
          );
          break;
        case VTK_HEXAHEDRON:
          const faces = [
            [0, 1, 2, 3],
            [4, 5, 6, 7],
            [0, 1, 5, 4],
            [2, 3, 7, 6],
            [0, 3, 7, 4],
            [1, 2, 6, 5],
          ];

          faces.forEach((face) => {
            cells.push(
              3,
              cellIndices[face[0]],
              cellIndices[face[1]],
              cellIndices[face[2]],
              3,
              cellIndices[face[0]],
              cellIndices[face[2]],
              cellIndices[face[3]]
            );
          });
          break;
        case VTK_WEDGE:
          const wedgeFaces = [
            [0, 1, 2],
            [3, 4, 5],
            [0, 1, 4, 3],
            [1, 2, 5, 4],
            [0, 2, 5, 3],
          ];

          wedgeFaces.forEach((face) => {
            if (face.length === 3) {
              cells.push(3, ...face.map((idx) => cellIndices[idx]));
            } else {
              cells.push(
                3,
                cellIndices[face[0]],
                cellIndices[face[1]],
                cellIndices[face[2]],
                3,
                cellIndices[face[0]],
                cellIndices[face[2]],
                cellIndices[face[3]]
              );
            }
          });
          break;
        case VTK_PYRAMID:
          const pyramidFaces = [
            [0, 1, 2, 3],
            [0, 1, 4],
            [1, 2, 4],
            [2, 3, 4],
            [3, 0, 4],
          ];

          pyramidFaces.forEach((face) => {
            if (face.length === 3) {
              cells.push(3, ...face.map((idx) => cellIndices[idx]));
            } else {
              cells.push(
                3,
                cellIndices[face[0]],
                cellIndices[face[1]],
                cellIndices[face[2]],
                3,
                cellIndices[face[0]],
                cellIndices[face[2]],
                cellIndices[face[3]]
              );
            }
          });
          break;
        default:
          if (numPoints >= 3) {
            for (let j = 0; j < numPoints - 2; j++) {
              cells.push(
                3,
                cellIndices[0],
                cellIndices[j + 1],
                cellIndices[j + 2]
              );
            }
          }
      }

      previousOffset = offsetsArray[i];
    }

    return new Uint32Array(cells);
  };

  const extractScalars = (xmlDoc, scalarName) => {
    const scalarTag = xmlDoc.querySelector(`PointData DataArray[Name="${scalarName}"]`);
    if (!scalarTag) return null;

    const scalarArray = scalarTag.textContent.trim().split(/\s+/).map(Number);
    return vtkDataArray.newInstance({
      name: scalarTag.getAttribute("Name"),
      values: new Float32Array(scalarArray),
    });
  };

  const applyColorMap = (mapper, scalarRange) => {
    const lut = vtkColorTransferFunction.newInstance();
    const min = scalarRange[0];
    const max = scalarRange[1];

    lut.addRGBPoint(min, 0.0, 0.0, 1.0); // Deep Blue
    lut.addRGBPoint(min + (max - min) * 0.125, 0.0, 0.2157, 1.0);
    lut.addRGBPoint(min + (max - min) * 0.25, 0.0, 0.4275, 1.0);
    lut.addRGBPoint(min + (max - min) * 0.375, 0.0392, 0.6431, 0.9961);
    lut.addRGBPoint(min + (max - min) * 0.5, 0.2745, 0.8157, 0.9255);
    lut.addRGBPoint(min + (max - min) * 0.625, 0.9961, 0.6431, 0.4745);
    lut.addRGBPoint(min + (max - min) * 0.75, 1.0, 0.4275, 0.2745);
    lut.addRGBPoint(min + (max - min) * 0.875, 1.0, 0.2157, 0.1333);
    lut.addRGBPoint(max, 1.0, 0.0, 0.0); // Deep Red

    mapper.setLookupTable(lut);
    mapper.setScalarRange(...scalarRange);
  };

  const parseVTUFile = async (file) => {
    const reader = new FileReader();
    return new Promise((resolve, reject) => {
      reader.onload = (event) => {
        try {
          const parser = new DOMParser();
          const xmlDoc = parser.parseFromString(event.target.result, "application/xml");
          resolve(xmlDoc);
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
  };

  const addVTUToScene = async (file, options = {}) => {
    const xmlDoc = await parseVTUFile(file);
    const scalarFields = getAllScalarFields(xmlDoc);
    const selectedScalar = options.scalarField || scalarFields[0];

    const points = extractPoints(xmlDoc);
    const cells = extractCells(xmlDoc);
    const polyData = vtkPolyData.newInstance();

    polyData.getPoints().setData(points);
    polyData.getPolys().setData(cells);

    const scalars = extractScalars(xmlDoc, selectedScalar);
    polyData.getPointData().setScalars(scalars);

    const mapper = vtkMapper.newInstance();
    mapper.setInputData(polyData);
    
    const actor = vtkActor.newInstance();
    actor.setMapper(mapper);

    const scalarRange = [Math.min(...scalars.getData()), Math.max(...scalars.getData())];
    applyColorMap(mapper, scalarRange);

    renderer.addActor(actor);
    renderer.resetCamera();
    renderWindow.render();

    return { polyData, actor, scalarFields };
  };

  return {
    addVTUToScene,
    setRepresentation: (actor, type) => {
      const property = actor.getProperty();
      if (type === "points") property.setRepresentation(0);
      else if (type === "wireframe") property.setRepresentation(1);
      else if (type === "surface") property.setRepresentation(2);
      else if (type === "surface_with_edges") {
        property.setRepresentation(2);
        property.setEdgeVisibility(true);
      }
      renderWindow.render();
    },
    enableThreshold: (actor, thresholdValue) => {
      const mapper = actor.getMapper();
      const polyData = mapper.getInputData();

      const scalars = polyData.getPointData().getScalars().getData();
      const mask = scalars.map((value) => value > thresholdValue);

      const filteredPoints = new Float32Array(
        polyData
          .getPoints()
          .getData()
          .filter((_, index) => mask[Math.floor(index / 3)])
      );

      const filteredPolyData = vtkPolyData.newInstance();
      filteredPolyData.getPoints().setData(filteredPoints);

      mapper.setInputData(filteredPolyData);
      renderWindow.render();
    },
    dispose: () => {
      window.removeEventListener("resize", resizeRenderer);
      renderWindow.delete();
    },
  };
};

export default createVTUViewer;
